import { describe, it, expect } from 'vitest';

import { mergeIntoLifecycles, utcDaysInRange } from '../routes/secrets.js';

const ev = (
  action: 'created' | 'retrieved' | 'expired',
  secret_id: string,
  ts: string,
  source = 'slack',
) => ({
  pk: ts.slice(0, 10),
  sk: `${ts}#${secret_id}#xxxxxxxx`,
  action,
  secret_id,
  source,
  ts,
});

describe('utcDaysInRange', () => {
  it('returns the single UTC day when start+end fall on the same day', () => {
    const start = Date.parse('2026-05-18T01:00:00Z');
    const end = Date.parse('2026-05-18T03:00:00Z');
    expect(utcDaysInRange(start, end)).toEqual(['2026-05-18']);
  });

  it('spans the UTC midnight boundary', () => {
    const start = Date.parse('2026-05-17T22:00:00Z');
    const end = Date.parse('2026-05-18T03:00:00Z');
    expect(utcDaysInRange(start, end)).toEqual(['2026-05-18', '2026-05-17']);
  });

  it('covers 7 days', () => {
    const start = Date.parse('2026-05-11T00:00:00Z');
    const end = Date.parse('2026-05-18T00:00:00Z');
    expect(utcDaysInRange(start, end)).toHaveLength(8);
  });
});

describe('mergeIntoLifecycles', () => {
  it('pairs a created + retrieved into a single retrieved row', () => {
    const out = mergeIntoLifecycles([
      ev('created', 'a1', '2026-05-18T10:00:00.000Z'),
      ev('retrieved', 'a1', '2026-05-18T10:05:00.000Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].resolution).toBe('retrieved');
    expect(out[0].age_seconds).toBe(300);
  });

  it('pairs a created + expired into a single expired row', () => {
    const out = mergeIntoLifecycles([
      ev('created', 'b1', '2026-05-18T10:00:00.000Z', 'discord'),
      ev('expired', 'b1', '2026-05-18T10:10:00.000Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].resolution).toBe('expired');
    // Source comes from the created event, not the resolution event.
    expect(out[0].source).toBe('discord');
  });

  it('leaves a created-only row as pending', () => {
    const out = mergeIntoLifecycles([ev('created', 'c1', '2026-05-18T10:00:00.000Z')]);
    expect(out[0].resolution).toBe('pending');
    expect(out[0].age_seconds).toBeNull();
  });

  it('handles a resolution event whose created event has fallen out of the window', () => {
    const out = mergeIntoLifecycles([ev('retrieved', 'd1', '2026-05-18T10:00:00.000Z')]);
    expect(out[0].created_at).toBeNull();
    expect(out[0].resolved_at).toBe('2026-05-18T10:00:00.000Z');
    expect(out[0].resolution).toBe('retrieved');
  });

  it('sorts newest first by created_at', () => {
    const out = mergeIntoLifecycles([
      ev('created', 'old', '2026-05-18T08:00:00.000Z'),
      ev('created', 'new', '2026-05-18T11:00:00.000Z'),
      ev('created', 'mid', '2026-05-18T09:30:00.000Z'),
    ]);
    expect(out.map((l) => l.secret_id)).toEqual(['new', 'mid', 'old']);
  });

  it('multiple secrets, each get their own lifecycle row', () => {
    const out = mergeIntoLifecycles([
      ev('created', 'a', '2026-05-18T10:00:00.000Z'),
      ev('created', 'b', '2026-05-18T10:01:00.000Z'),
      ev('retrieved', 'a', '2026-05-18T10:05:00.000Z'),
    ]);
    expect(out).toHaveLength(2);
    const a = out.find((l) => l.secret_id === 'a')!;
    const b = out.find((l) => l.secret_id === 'b')!;
    expect(a.resolution).toBe('retrieved');
    expect(b.resolution).toBe('pending');
  });
});
