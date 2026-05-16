import { describe, it, expect } from 'vitest';

import { buildEventsQuery } from '../lib/insightsClient.js';

describe('buildEventsQuery', () => {
  const baseArgs = {
    logGroupPrefixes: [],
    logGroupNames: [],
    startMs: 0,
    endMs: 1,
  };

  it('builds a base query with no filters', () => {
    const q = buildEventsQuery(baseArgs);
    expect(q).toContain('fields @timestamp, @message');
    expect(q).toContain('sort @timestamp desc');
    expect(q).toContain('limit 200');
    expect(q).not.toContain('filter');
  });

  it('adds a handler filter', () => {
    const q = buildEventsQuery({ ...baseArgs, handlerFilter: 'oauth-callback' });
    expect(q).toContain('handler = "oauth-callback"');
    expect(q).toContain('filter');
  });

  it('combines multiple filters with `and`', () => {
    const q = buildEventsQuery({
      ...baseArgs,
      handlerFilter: 'command-worker',
      outcomeFilter: 'ok',
      teamIdFilter: 'T123',
    });
    expect(q).toContain('handler = "command-worker"');
    expect(q).toContain('outcome = "ok"');
    expect(q).toContain('team_id = "T123"');
    expect(q).toContain(' and ');
  });

  it('escapes embedded quotes to prevent broken queries', () => {
    const q = buildEventsQuery({ ...baseArgs, handlerFilter: 'broken"name' });
    expect(q).toContain('handler = "broken\\"name"');
  });

  it('clamps limit to 1000', () => {
    const q = buildEventsQuery({ ...baseArgs, limit: 100_000 });
    expect(q).toContain('limit 1000');
  });

  it('clamps limit to at least 1', () => {
    const q = buildEventsQuery({ ...baseArgs, limit: 0 });
    expect(q).toContain('limit 1');
  });
});
