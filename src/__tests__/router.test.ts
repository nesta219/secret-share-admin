import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { buildRouter } from '../lib/router.js';

const event = (method: string, rawPath: string): APIGatewayProxyEventV2 =>
  ({
    rawPath,
    requestContext: { http: { method } },
  }) as unknown as APIGatewayProxyEventV2;

describe('router', () => {
  it('dispatches to a literal route', async () => {
    const me = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const router = buildRouter([{ method: 'GET', pattern: 'me', handler: me }]);
    await router(event('GET', '/api/admin/me'));
    expect(me).toHaveBeenCalledOnce();
  });

  it('extracts named params from a path pattern', async () => {
    const installs = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const router = buildRouter([
      { method: 'GET', pattern: 'integrations/:name/installs', handler: installs },
    ]);
    await router(event('GET', '/api/admin/integrations/slack/installs'));
    expect(installs).toHaveBeenCalledOnce();
    expect(installs.mock.calls[0][1]).toEqual({ name: 'slack' });
  });

  it('returns 404 for an unknown path', async () => {
    const router = buildRouter([{ method: 'GET', pattern: 'me', handler: vi.fn() }]);
    const res = await router(event('GET', '/api/admin/missing'));
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for the wrong method', async () => {
    const router = buildRouter([{ method: 'GET', pattern: 'me', handler: vi.fn() }]);
    const res = await router(event('POST', '/api/admin/me'));
    expect(res.statusCode).toBe(404);
  });

  it('does not match prefix-only', async () => {
    // Without this guarantee, `integrations` would accidentally match
    // `integrations/slack/installs` and route to the wrong handler.
    const integrations = vi.fn();
    const router = buildRouter([{ method: 'GET', pattern: 'integrations', handler: integrations }]);
    const res = await router(event('GET', '/api/admin/integrations/slack/installs'));
    expect(integrations).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('url-decodes path params', async () => {
    const installs = vi.fn().mockResolvedValue({ statusCode: 200, body: '{}' });
    const router = buildRouter([
      { method: 'GET', pattern: 'installs/:id', handler: installs },
    ]);
    await router(event('GET', '/api/admin/installs/some%20id'));
    expect(installs.mock.calls[0][1]).toEqual({ id: 'some id' });
  });
});
