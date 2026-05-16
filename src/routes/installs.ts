import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { scanInstalls } from '../lib/ddbClient.js';
import { log } from '../lib/log.js';
import { findPlatform, projectSafe } from '../lib/platforms.js';
import { badRequest, notFound, ok, serverError } from '../lib/response.js';

// GET /api/admin/integrations/:name/installs — list installs for one platform.
// Server-side projection to safe_fields strips bot_token (slack) etc. before
// the response is built. The SPA never sees a sensitive field — defense in
// depth via projectSafe in platforms.ts on top of explicit allowlist here.
export const installs = async (event: APIGatewayProxyEventV2, params: Record<string, string>) => {
  const platform = findPlatform(params.name);
  if (!platform) return notFound(`Unknown platform: ${params.name}`);

  const qs = event.queryStringParameters ?? {};
  const limit = qs.limit ? Math.max(1, Math.min(parseInt(qs.limit, 10) || 100, 500)) : 100;
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (qs.next) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(qs.next, 'base64url').toString('utf8'));
    } catch {
      return badRequest('Invalid `next` cursor');
    }
  }

  try {
    const scan = await scanInstalls(platform.table_name, limit, exclusiveStartKey);
    const projected = scan.items.map((item) => projectSafe(platform, item));
    const nextCursor = scan.lastEvaluatedKey
      ? Buffer.from(JSON.stringify(scan.lastEvaluatedKey)).toString('base64url')
      : null;

    log({
      handler: 'installs',
      outcome: 'ok',
      source: 'admin',
      platform: platform.name,
      count: projected.length,
    });

    return ok({
      platform: platform.name,
      display_name: platform.display_name,
      installs: projected,
      count: scan.count,
      next: nextCursor,
    });
  } catch (err) {
    log({
      handler: 'installs',
      outcome: 'error',
      source: 'admin',
      platform: platform.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError('Scan failed');
  }
};
