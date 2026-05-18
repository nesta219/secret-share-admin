import { describe, it, expect, beforeAll } from 'vitest';

import { getAuthContext, type AuthContext } from './auth.js';

// End-to-end smoke against a deployed admin. Mints a real Cognito JWT via
// admin-initiate-auth and hits every /api/admin/* route through the public
// HTTPS endpoint (CloudFront → API Gateway → Lambda). Catches the class of
// bug that pure unit tests don't:
//   - malformed Logs Insights queries (the 500-loop that triggered this file)
//   - IAM mis-scoping (cross-env data leaks, denied StartQuery)
//   - JWT authorizer config (audience/issuer mismatch)
//   - route registration mistakes
//   - bot_token leaks past the redaction allowlist

let ctx: AuthContext;
const hdrs = () => ({ authorization: `Bearer ${ctx.idToken}` });

beforeAll(async () => {
  ctx = await getAuthContext();
}, 30_000);

describe('admin API integration', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/me`);
    expect(res.status).toBe(401);
  });

  it('GET /me returns the caller claims', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/me`, { headers: hdrs() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sub: string; email: string | null };
    expect(body.sub).toMatch(/^[a-f0-9-]{36}$/);
    expect(body.email).toBeTruthy();
  });

  it('GET /integrations returns the configured platforms with deployed flags', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/integrations`, { headers: hdrs() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      integrations: Array<{ name: string; deployed: boolean }>;
    };
    expect(body.integrations.length).toBeGreaterThan(0);
    expect(body.integrations.every((i) => typeof i.deployed === 'boolean')).toBe(true);
  });

  it('GET /integrations/slack/installs never returns bot_token (redaction invariant)', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/integrations/slack/installs`, { headers: hdrs() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { installs: Array<Record<string, unknown>> };
    for (const install of body.installs) {
      expect(install).not.toHaveProperty('bot_token');
    }
  });

  it('GET /integrations/<undeployed>/installs returns not_deployed:true, not 500', async () => {
    // In production, discord is configured but deployed=false. In dev both are
    // deployed, so we look up the integrations list and skip if everything is deployed.
    const integrationsRes = await fetch(`${ctx.apiBase}/api/admin/integrations`, { headers: hdrs() });
    const { integrations } = (await integrationsRes.json()) as {
      integrations: Array<{ name: string; deployed: boolean }>;
    };
    const undeployed = integrations.find((i) => !i.deployed);
    if (!undeployed) return; // skip in envs where every platform is deployed
    const res = await fetch(
      `${ctx.apiBase}/api/admin/integrations/${undeployed.name}/installs`,
      { headers: hdrs() },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { not_deployed: boolean; installs: unknown[] };
    expect(body.not_deployed).toBe(true);
    expect(body.installs).toEqual([]);
  });

  it('GET /events returns 200 with a query result (Logs Insights syntax sanity)', async () => {
    // The original bug: clauses were joined with a space, producing
    // `fields ... sort ... limit ...` which CloudWatch rejected. A unit test
    // on the query builder can be tightened, but only an actual round-trip
    // against CloudWatch catches the next variant of this.
    const res = await fetch(`${ctx.apiBase}/api/admin/events?limit=10`, { headers: hdrs() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { complete: boolean; events: unknown[] };
    expect(body).toHaveProperty('complete');
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('GET /events ?handler=X passes a filter clause through', async () => {
    const res = await fetch(
      `${ctx.apiBase}/api/admin/events?handler=oauth-callback&limit=5`,
      { headers: hdrs() },
    );
    expect(res.status).toBe(200);
  });

  it('GET /stats returns numeric totals for the canonical metric names', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/stats?range=24h`, { headers: hdrs() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totals: Record<string, number> };
    expect(body.totals).toHaveProperty('CanarySuccess');
    expect(body.totals).toHaveProperty('SecretsCreated');
    expect(body.totals).toHaveProperty('SecretsRetrieved');
  });

  it('GET /health returns alarms with valid states', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/health`, { headers: hdrs() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alarms: Array<{ state: string }> };
    expect(body.alarms.length).toBeGreaterThan(0);
    for (const a of body.alarms) {
      expect(['OK', 'ALARM', 'INSUFFICIENT_DATA']).toContain(a.state);
    }
  });

  it('GET /secrets returns summary + lifecycles for 24h', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/secrets?range=24h`, { headers: hdrs() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      range: string;
      truncated: boolean;
      summary: { created: number; retrieved: number; expired: number; pending: number };
      lifecycles: Array<{ secret_id: string; resolution: string }>;
    };
    expect(body.range).toBe('24h');
    expect(body.summary.created).toBeGreaterThanOrEqual(0);
    for (const lc of body.lifecycles) {
      expect(['pending', 'retrieved', 'expired']).toContain(lc.resolution);
    }
  });

  it('GET /secrets never returns the secret payload', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/secrets?range=30d`, { headers: hdrs() });
    expect(res.status).toBe(200);
    const text = await res.text();
    // The /api/admin/secrets response shape has no field that could possibly
    // contain the payload — but we paranoia-check anyway: no row should expose
    // anything attribute-named "secret" or "payload" or "message" or "value".
    const body = JSON.parse(text) as { lifecycles: Array<Record<string, unknown>> };
    for (const lc of body.lifecycles) {
      expect(lc).not.toHaveProperty('secret');
      expect(lc).not.toHaveProperty('payload');
      expect(lc).not.toHaveProperty('message');
      expect(lc).not.toHaveProperty('value');
    }
  });

  it('GET /secrets?range=invalid returns 400', async () => {
    const res = await fetch(`${ctx.apiBase}/api/admin/secrets?range=10y`, { headers: hdrs() });
    expect(res.status).toBe(400);
  });
});
