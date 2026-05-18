import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { log } from '../lib/log.js';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Triggered by the main app's secrets-table DDB stream. One stream record
// per put/get/expire on a secret. We write one row to the secret-events
// table per relevant record so the admin's Secrets tab can render lifecycle
// rows without scanning CloudWatch Logs Insights.
//
// CRITICAL PRIVACY INVARIANT: the stream NewImage / OldImage contains the
// `secret` attribute (the actual payload). This handler must NEVER read,
// log, or write that attribute. We hand-extract only the id, source, and
// ttl fields explicitly.
export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  const tableName = process.env.SECRET_EVENTS_TABLE;
  const retentionDays = parseInt(process.env.EVENT_RETENTION_DAYS ?? '90', 10);
  if (!tableName) {
    log({ handler: 'secret-events-fanout', outcome: 'error', reason: 'missing_table_env' });
    return;
  }

  let written = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const record of event.Records) {
    try {
      const row = recordToEvent(record, retentionDays);
      if (!row) {
        skipped++;
        continue;
      }
      await docClient.send(new PutCommand({ TableName: tableName, Item: row }));
      written++;
    } catch (err) {
      // Log + continue so a single bad record doesn't poison the batch.
      // Lambda will retry the whole batch up to maximum_retry_attempts, but
      // bisect_batch_on_function_error narrows the blame to the bad record.
      failures.push(record.eventID ?? '?');
      log({
        handler: 'secret-events-fanout',
        outcome: 'error',
        reason: 'record_failed',
        event_id: record.eventID,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log({
    handler: 'secret-events-fanout',
    outcome: failures.length === 0 ? 'ok' : 'partial',
    written,
    skipped,
    failures: failures.length,
  });

  // If any record failed, throw so the stream consumer retries (with bisect).
  if (failures.length > 0) {
    throw new Error(`secret-events-fanout: ${failures.length} record(s) failed`);
  }
};

export interface SecretEventRow {
  pk: string;
  sk: string;
  action: 'created' | 'retrieved' | 'expired';
  secret_id: string;
  source: string;
  ts: string;
  expires_at: number;
}

// Maps one stream record to a secret-events row, or null to skip.
export const recordToEvent = (
  record: DynamoDBRecord,
  retentionDays: number,
): SecretEventRow | null => {
  // Hand-extract — explicitly NEVER touch the `secret` attribute. Source is
  // optional because old rows written before put-item started persisting it
  // won't have it; default to 'unknown' so they don't get dropped silently.
  const newImage = record.dynamodb?.NewImage;
  const oldImage = record.dynamodb?.OldImage;
  const image = newImage ?? oldImage;
  const id = image?.id?.S;
  if (!id) return null;
  const source = image?.source?.S ?? 'unknown';

  const action = classifyEvent(record);
  if (!action) return null;

  // Use the stream's ApproximateCreationDateTime so retrieved/expired rows
  // sort by their actual occurrence time, not by when this fanout ran.
  const tsMs = record.dynamodb?.ApproximateCreationDateTime
    ? Number(record.dynamodb.ApproximateCreationDateTime) * 1000
    : Date.now();
  const ts = new Date(tsMs).toISOString();
  const day = ts.slice(0, 10); // 'YYYY-MM-DD' (UTC)

  return {
    pk: day,
    // Tiebreak with eventID to keep two events at the same ms unique.
    sk: `${ts}#${id}#${(record.eventID ?? '').slice(-8)}`,
    action,
    secret_id: id,
    source,
    ts,
    expires_at: Math.trunc(tsMs / 1000) + retentionDays * 24 * 60 * 60,
  };
};

// INSERT → created; REMOVE with service identity → expired; REMOVE otherwise → retrieved.
// MODIFY skipped at the event-source-mapping filter level; this is a guard.
export const classifyEvent = (record: DynamoDBRecord): SecretEventRow['action'] | null => {
  if (record.eventName === 'INSERT') return 'created';
  if (record.eventName === 'REMOVE') {
    const ui = (record as DynamoDBRecord & {
      userIdentity?: { type?: string; principalId?: string };
    }).userIdentity;
    if (ui?.type === 'Service' && ui.principalId === 'dynamodb.amazonaws.com') return 'expired';
    return 'retrieved';
  }
  return null;
};
