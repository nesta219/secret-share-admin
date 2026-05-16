import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface JwtClaims {
  sub: string;
  email?: string;
  exp?: number;
  iat?: number;
  // Cognito places additional claims here; we accept anything string-keyed.
  [key: string]: unknown;
}

// HTTP API v2's JWT authorizer validates the token at the gateway and forwards
// the decoded claims to the Lambda. No JWKS fetch, no signature verification
// in app code — we just read what the gateway gave us.
export const getClaims = (event: APIGatewayProxyEventV2): JwtClaims | null => {
  // Type-cast: aws-lambda's APIGatewayProxyEventV2 has authorizer typed as `unknown`.
  const authorizer = (event.requestContext as unknown as {
    authorizer?: { jwt?: { claims?: JwtClaims } };
  }).authorizer;
  return authorizer?.jwt?.claims ?? null;
};
