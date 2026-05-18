import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { log } from '../lib/log.js';
import { badRequest, ok, serverError } from '../lib/response.js';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface RawEvent {
  pk: string;
  sk: string;
  action: 'created' | 'retrieved' | 'expired';
  secret_id: string;
  source: string;
  ts: string;
}

// One row per secret in the requested window. The Secrets tab UI cares about
// the entity ("a secret was shared"), not the individual create/read events,
// so we collapse events into a lifecycle here rather than ship raw events
// to the SPA and group client-side. Saves bytes + keeps the SPA dumb.
export interface SecretLifecycle {
  secret_id: string;
  source: string;
  created_at: string | null;
  resolved_at: string | null;
  resolution: 'pending' | 'retrieved' | 'expired';
  age_seconds: number | null;
}

export interface SecretsSummary {
  created: number;
  retrieved: number;
  expired: number;
  pending: number; // created in window, not yet retrieved or expired
}

const RANGES_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// GET /api/admin/secrets?range=24h&source=slack
//
// Query strategy: secret-events is partitioned by UTC day. We query one
// partition per day in the range, descending sort (most-recent first), then
// merge into per-secret lifecycle rows.
//
// Limits: hard cap of 5000 events read from DDB per request to keep latency
// + cost bounded. A noisy day would truncate; we surface that via `truncated`.
export const secrets = async (event: APIGatewayProxyEventV2) => {
  const tableName = process.env.SECRET_EVENTS_TABLE;
  if (!tableName) return serverError('SECRET_EVENTS_TABLE env var missing');

  const qs = event.queryStringParameters ?? {};
  const range = qs.range ?? '24h';
  const rangeMs = RANGES_MS[range];
  if (!rangeMs) return badRequest(`Unknown range: ${range}. Use one of ${Object.keys(RANGES_MS).join(', ')}`);
  const sourceFilter = qs.source?.trim() || null;

  const now = Date.now();
  const sinceMs = now - rangeMs;
  const days = utcDaysInRange(sinceMs, now);

  try {
    const events: RawEvent[] = [];
    let truncated = false;
    const HARD_CAP = 5000;

    for (const day of days) {
      let exclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const out = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: { ':pk': day },
            ScanIndexForward: false, // newest first
            Limit: 500,
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );
        for (const item of (out.Items as RawEvent[] | undefined) ?? []) {
          // Discard events outside the window (the partition is a whole UTC day,
          // so the head/tail of the range needs filtering).
          const tsMs = Date.parse(item.ts);
          if (tsMs < sinceMs || tsMs > now) continue;
          if (sourceFilter && item.source !== sourceFilter) continue;
          events.push(item);
          if (events.length >= HARD_CAP) {
            truncated = true;
            break;
          }
        }
        exclusiveStartKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (exclusiveStartKey && !truncated);
      if (truncated) break;
    }

    const lifecycles = mergeIntoLifecycles(events);
    const summary = summarize(lifecycles);

    log({
      handler: 'secrets',
      outcome: 'ok',
      source: 'admin',
      range,
      raw_events: events.length,
      lifecycles: lifecycles.length,
      truncated,
    });

    return ok({
      range,
      truncated,
      summary,
      lifecycles,
    });
  } catch (err) {
    log({
      handler: 'secrets',
      outcome: 'error',
      source: 'admin',
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError('Secrets query failed');
  }
};

// Returns UTC date strings YYYY-MM-DD covering the [start, end] range inclusive.
export const utcDaysInRange = (startMs: number, endMs: number): string[] => {
  const days: string[] = [];
  // Start at the UTC midnight of the END day; walk backwards.
  const endDay = new Date(endMs);
  endDay.setUTCHours(0, 0, 0, 0);
  let cursorMs = endDay.getTime();
  // Loop until cursor is before startMs's UTC midnight.
  const startDay = new Date(startMs);
  startDay.setUTCHours(0, 0, 0, 0);
  const startDayMs = startDay.getTime();
  while (cursorMs >= startDayMs) {
    days.push(new Date(cursorMs).toISOString().slice(0, 10));
    cursorMs -= 24 * 60 * 60 * 1000;
  }
  return days;
};

// Collapse raw events into per-secret lifecycle rows. For each secret_id, we
// expect: 1 created + (0 or 1) (retrieved | expired). If a secret has only a
// non-created event (we joined the stream after the original INSERT), we still
// surface the resolution but with created_at=null.
export const mergeIntoLifecycles = (events: RawEvent[]): SecretLifecycle[] => {
  const bySecret = new Map<
    string,
    {
      created_at: string | null;
      resolved_at: string | null;
      resolution: SecretLifecycle['resolution'];
      source: string;
    }
  >();

  for (const ev of events) {
    const existing = bySecret.get(ev.secret_id) ?? {
      created_at: null,
      resolved_at: null,
      resolution: 'pending' as SecretLifecycle['resolution'],
      source: ev.source,
    };
    if (ev.action === 'created') {
      existing.created_at = ev.ts;
      // created event has the most accurate source (matches the original put-item).
      existing.source = ev.source;
    } else {
      existing.resolved_at = ev.ts;
      existing.resolution = ev.action;
    }
    bySecret.set(ev.secret_id, existing);
  }

  const out: SecretLifecycle[] = [];
  for (const [secret_id, s] of bySecret) {
    const age =
      s.created_at && s.resolved_at
        ? (Date.parse(s.resolved_at) - Date.parse(s.created_at)) / 1000
        : null;
    out.push({
      secret_id,
      source: s.source,
      created_at: s.created_at,
      resolved_at: s.resolved_at,
      resolution: s.resolution,
      age_seconds: age,
    });
  }
  // Newest first by created_at; if missing, by resolved_at.
  out.sort((a, b) => {
    const aT = a.created_at ?? a.resolved_at ?? '';
    const bT = b.created_at ?? b.resolved_at ?? '';
    return bT.localeCompare(aT);
  });
  return out;
};

const summarize = (lifecycles: SecretLifecycle[]): SecretsSummary => {
  let created = 0;
  let retrieved = 0;
  let expired = 0;
  let pending = 0;
  for (const lc of lifecycles) {
    if (lc.created_at) created++;
    if (lc.resolution === 'retrieved') retrieved++;
    else if (lc.resolution === 'expired') expired++;
    else if (lc.resolution === 'pending' && lc.created_at) pending++;
  }
  return { created, retrieved, expired, pending };
};
