import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { getClaims } from '../lib/jwt.js';
import { ok, serverError } from '../lib/response.js';

export const me = async (event: APIGatewayProxyEventV2) => {
  const claims = getClaims(event);
  if (!claims) return serverError('No JWT claims on request — authorizer misconfigured');
  return ok({
    sub: claims.sub,
    email: claims.email ?? null,
    exp: claims.exp ?? null,
    iat: claims.iat ?? null,
  });
};
