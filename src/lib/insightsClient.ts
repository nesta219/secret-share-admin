import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  type QueryStatus,
} from '@aws-sdk/client-cloudwatch-logs';

const client = new CloudWatchLogsClient({});

export interface EventsQueryArgs {
  logGroupPrefixes: string[]; // e.g. ["/aws/lambda/slack-app-", "/aws/lambda/secret-share-backend-dev-"]
  // Concrete log group identifiers to query against; if omitted the caller should
  // resolve them via DescribeLogGroups beforehand. We accept a flat list to keep
  // the route handler simple.
  logGroupNames: string[];
  startMs: number;
  endMs: number;
  handlerFilter?: string;
  outcomeFilter?: string;
  teamIdFilter?: string;
  limit?: number;
}

export interface EventsRow {
  ts: string;
  handler?: string;
  outcome?: string;
  source?: string;
  team_id?: string;
  install_id?: string;
  event_type?: string;
  reason?: string;
  raw: string; // full @message for the SPA to expand on click
}

const escapeQuotes = (s: string) => s.replace(/"/g, '\\"');

// Build a Logs Insights query against structured JSON logs. The producer-side
// contract: every log line is `JSON.stringify({ handler, outcome, ts, ... })`.
export const buildEventsQuery = (args: EventsQueryArgs): string => {
  const filters: string[] = [];
  if (args.handlerFilter) filters.push(`handler = "${escapeQuotes(args.handlerFilter)}"`);
  if (args.outcomeFilter) filters.push(`outcome = "${escapeQuotes(args.outcomeFilter)}"`);
  if (args.teamIdFilter) filters.push(`team_id = "${escapeQuotes(args.teamIdFilter)}"`);

  const limit = Math.max(1, Math.min(args.limit ?? 200, 1000));

  // Logs Insights wants each clause separated by `|`. Joining with a plain space
  // produces `fields ... sort ... limit ...` which the parser rejects with
  // MalformedQueryException — the bug that made /api/admin/events 500 on every call.
  const clauses = [
    'fields @timestamp, @message, handler, outcome, source, team_id, install_id, event_type, reason',
    ...(filters.length > 0 ? [`filter ${filters.join(' and ')}`] : []),
    'sort @timestamp desc',
    `limit ${limit}`,
  ];
  return clauses.join(' | ');
};

export interface QueryStartResult {
  queryId: string;
}

export const startQuery = async (
  logGroupNames: string[],
  queryString: string,
  startMs: number,
  endMs: number,
): Promise<QueryStartResult> => {
  const out = await client.send(
    new StartQueryCommand({
      logGroupNames,
      queryString,
      startTime: Math.floor(startMs / 1000),
      endTime: Math.floor(endMs / 1000),
    }),
  );
  if (!out.queryId) throw new Error('CloudWatch Logs returned no queryId');
  return { queryId: out.queryId };
};

export interface QueryPollResult {
  status: QueryStatus;
  rows: EventsRow[];
  complete: boolean;
}

const fieldMap = (row: Array<{ field?: string; value?: string }>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of row) {
    if (f.field && f.value !== undefined) out[f.field] = f.value;
  }
  return out;
};

export const pollQuery = async (queryId: string): Promise<QueryPollResult> => {
  const out = await client.send(new GetQueryResultsCommand({ queryId }));
  const status = (out.status ?? 'Unknown') as QueryStatus;
  const rows: EventsRow[] = (out.results ?? []).map((row) => {
    const m = fieldMap(row);
    return {
      ts: m['@timestamp'] ?? '',
      handler: m.handler,
      outcome: m.outcome,
      source: m.source,
      team_id: m.team_id,
      install_id: m.install_id,
      event_type: m.event_type,
      reason: m.reason,
      raw: m['@message'] ?? '',
    };
  });
  const complete = status === 'Complete' || status === 'Failed' || status === 'Cancelled' || status === 'Timeout';
  return { status, rows, complete };
};

// Sliding-window poll: do up to N polls within a budget. Returns rows + queryId
// the SPA can use to continue if budget exhausted. Single Insights query takes
// 1-10s typically; this keeps the Lambda response under 8s most of the time.
export const startAndPoll = async (
  logGroupNames: string[],
  queryString: string,
  startMs: number,
  endMs: number,
  budgetMs = 8000,
): Promise<{ queryId: string; rows: EventsRow[]; complete: boolean }> => {
  const started = await startQuery(logGroupNames, queryString, startMs, endMs);
  const deadline = Date.now() + budgetMs;

  while (Date.now() < deadline) {
    const poll = await pollQuery(started.queryId);
    if (poll.complete) {
      return { queryId: started.queryId, rows: poll.rows, complete: true };
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  const final = await pollQuery(started.queryId);
  return { queryId: started.queryId, rows: final.rows, complete: final.complete };
};
