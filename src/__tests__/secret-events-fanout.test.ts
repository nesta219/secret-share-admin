import { describe, it, expect } from 'vitest';
import type { DynamoDBRecord } from 'aws-lambda';

import { classifyEvent, recordToEvent } from '../handlers/secret-events-fanout.js';

const insertRecord = (id: string, source = 'web'): DynamoDBRecord => ({
  eventID: 'evt-1',
  eventName: 'INSERT',
  dynamodb: {
    ApproximateCreationDateTime: 1779062400, // 2026-05-18T00:00:00Z
    NewImage: {
      id: { S: id },
      source: { S: source },
      secret: { S: 'NEVER-LOG-THIS-PAYLOAD' },
      ttl: { N: '1747527000' },
    },
  },
});

const userRemoveRecord = (id: string, source = 'slack'): DynamoDBRecord => ({
  eventID: 'evt-2',
  eventName: 'REMOVE',
  dynamodb: {
    ApproximateCreationDateTime: 1779062460, // +60s
    OldImage: {
      id: { S: id },
      source: { S: source },
      secret: { S: 'NEVER-LOG-THIS-PAYLOAD' },
    },
  },
});

const ttlRemoveRecord = (id: string, source = 'discord'): DynamoDBRecord => {
  const rec = userRemoveRecord(id, source);
  rec.eventID = 'evt-3';
  // TTL removes carry a userIdentity of the dynamodb service principal.
  (rec as DynamoDBRecord & { userIdentity?: object }).userIdentity = {
    type: 'Service',
    principalId: 'dynamodb.amazonaws.com',
  };
  return rec;
};

describe('classifyEvent', () => {
  it('INSERT → created', () => {
    expect(classifyEvent(insertRecord('a'))).toBe('created');
  });

  it('REMOVE without service userIdentity → retrieved (the user read it)', () => {
    expect(classifyEvent(userRemoveRecord('a'))).toBe('retrieved');
  });

  it('REMOVE with dynamodb service userIdentity → expired (TTL fired)', () => {
    expect(classifyEvent(ttlRemoveRecord('a'))).toBe('expired');
  });

  it('MODIFY → null (we filter at the event-source-mapping but this is the guard)', () => {
    const rec: DynamoDBRecord = { eventID: 'x', eventName: 'MODIFY', dynamodb: {} };
    expect(classifyEvent(rec)).toBeNull();
  });
});

describe('recordToEvent', () => {
  it('builds a created row from an INSERT', () => {
    const row = recordToEvent(insertRecord('abc12345', 'slack'), 90);
    expect(row).not.toBeNull();
    expect(row!.action).toBe('created');
    expect(row!.secret_id).toBe('abc12345');
    expect(row!.source).toBe('slack');
    expect(row!.pk).toBe('2026-05-18');
    expect(row!.sk.startsWith('2026-05-18T00:00:00.000Z#abc12345')).toBe(true);
    expect(row!.expires_at).toBeGreaterThan(1779062400);
  });

  it('builds an expired row from a TTL REMOVE using OldImage', () => {
    const row = recordToEvent(ttlRemoveRecord('xyz98765'), 90);
    expect(row!.action).toBe('expired');
    expect(row!.secret_id).toBe('xyz98765');
    expect(row!.source).toBe('discord');
  });

  it('defaults source to "unknown" if the row predates source persistence', () => {
    const rec = insertRecord('legacy01');
    delete rec.dynamodb!.NewImage!.source;
    const row = recordToEvent(rec, 90);
    expect(row!.source).toBe('unknown');
  });

  it('NEVER persists the secret payload — written row only has whitelisted fields', () => {
    const row = recordToEvent(insertRecord('abc12345', 'slack'), 90);
    expect(row).not.toBeNull();
    const written = Object.keys(row!);
    expect(written.sort()).toEqual(['action', 'expires_at', 'pk', 'secret_id', 'sk', 'source', 'ts'].sort());
    expect(JSON.stringify(row)).not.toContain('NEVER-LOG-THIS-PAYLOAD');
  });

  it('returns null when the stream record has no id (unparseable)', () => {
    const rec: DynamoDBRecord = { eventID: 'x', eventName: 'INSERT', dynamodb: {} };
    expect(recordToEvent(rec, 90)).toBeNull();
  });
});
