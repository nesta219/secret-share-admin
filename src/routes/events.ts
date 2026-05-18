import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { buildEventsQuery, pollQuery, startAndPoll } from '../lib/insightsClient.js';
import { log } from '../lib/log.js';
import { badRequest, ok, serverError } from '../lib/response.js';

const cwlClient = new CloudWatchLogsClient({});

let cachedLogGroups: { ts: number; names: string[] } | null = null;
const CACHE_TTL_MS = 60_000;

// Resolves the concrete log group names from the configured prefixes once per
// minute. Prefixes live in LOG_GROUP_PREFIXES (set by Terraform from env.hcl).
//
// Critical: each prefix may match log groups from BOTH dev and production
// (e.g. `/aws/lambda/slack-app-` matches `slack-app-command-dev` AND
// `slack-app-command-production`). After DescribeLogGroups returns, we filter
// to only the groups belonging to this admin's env — otherwise prod admin
// would surface dev events and the IAM grant would deny StartQuery on the
// other env's groups (the symptom that originally exposed this bug).
const resolveLogGroups = async (): Promise<string[]> => {
  if (cachedLogGroups && Date.now() - cachedLogGroups.ts < CACHE_TTL_MS) {
    return cachedLogGroups.names;
  }
  const prefixes = (process.env.LOG_GROUP_PREFIXES ?? '').split(',').filter(Boolean);
  const env = process.env.ENVIRONMENT ?? '';
  const names: string[] = [];
  for (const prefix of prefixes) {
    let nextToken: string | undefined;
    do {
      const out = await cwlClient.send(
        new DescribeLogGroupsCommand({ logGroupNamePrefix: prefix, nextToken }),
      );
      for (const lg of out.logGroups ?? []) {
        if (!lg.logGroupName) continue;
        if (!env || belongsToEnv(lg.logGroupName, env)) names.push(lg.logGroupName);
      }
      nextToken = out.nextToken;
    } while (nextToken);
  }
  cachedLogGroups = { ts: Date.now(), names };
  return names;
};

// Log group belongs to this env if its name ends with `-<env>` (platform repos:
// /aws/lambda/slack-app-command-production) or contains `-<env>-` as a segment
// (main app: /aws/lambda/secret-share-backend-production-putItemFunction).
// Conservative — anything else is rejected so we never accidentally pull cross-env data.
export const belongsToEnv = (logGroupName: string, env: string): boolean => {
  if (!env) return true;
  return logGroupName.endsWith(`-${env}`) || logGroupName.includes(`-${env}-`) || logGroupName.includes(`-${env}/`);
};

// GET /api/admin/events
// Supported query params:
//   since=<ISO|relative ms>  default: 1h
//   until=<ISO|relative ms>  default: now
//   handler=<handler-name>
//   outcome=ok|error|...
//   team_id=<id>
//   limit=N (default 200, max 1000)
//   queryId=<id>  if present, resumes a previously-started query
export const events = async (event: APIGatewayProxyEventV2) => {
  const qs = event.queryStringParameters ?? {};

  // Resume mode — only ever does a single pollQuery, returns fast.
  if (qs.queryId) {
    try {
      const poll = await pollQuery(qs.queryId);
      return ok({
        queryId: qs.queryId,
        complete: poll.complete,
        status: poll.status,
        events: poll.rows,
      });
    } catch (err) {
      return serverError(`Resume failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const now = Date.now();
  const startMs = parseTimestamp(qs.since, now - 60 * 60 * 1000);
  const endMs = parseTimestamp(qs.until, now);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return badRequest('Invalid since/until');
  if (endMs <= startMs) return badRequest('until must be after since');

  const queryString = buildEventsQuery({
    logGroupPrefixes: [],
    logGroupNames: [],
    startMs,
    endMs,
    handlerFilter: qs.handler,
    outcomeFilter: qs.outcome,
    teamIdFilter: qs.team_id,
    limit: qs.limit ? parseInt(qs.limit, 10) : undefined,
  });

  try {
    const logGroups = await resolveLogGroups();
    if (logGroups.length === 0) {
      return ok({ queryId: null, complete: true, status: 'Complete', events: [] });
    }
    const result = await startAndPoll(logGroups, queryString, startMs, endMs, 8000);
    log({ handler: 'events', outcome: 'ok', source: 'admin', count: result.rows.length });
    return ok({
      queryId: result.queryId,
      complete: result.complete,
      events: result.rows,
    });
  } catch (err) {
    log({
      handler: 'events',
      outcome: 'error',
      source: 'admin',
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError('Insights query failed');
  }
};

// Accepts either ISO 8601 (e.g. "2026-05-16T00:00:00Z") or relative-ms-from-now
// negative numbers (e.g. "-3600000" = 1h ago). Falls back to defaultMs.
const parseTimestamp = (raw: string | undefined, defaultMs: number): number => {
  if (!raw) return defaultMs;
  if (/^-?\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n < 0 ? Date.now() + n : n;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
};
