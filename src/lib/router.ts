import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

import { notFound } from './response.js';

export type RouteHandler = (
  event: APIGatewayProxyEventV2,
  params: Record<string, string>,
) => Promise<APIGatewayProxyStructuredResultV2>;

interface RouteSpec {
  method: string;
  pattern: string; // e.g. "integrations/:name/installs"
  handler: RouteHandler;
}

interface CompiledRoute {
  method: string;
  segments: Array<{ literal?: string; param?: string }>;
  handler: RouteHandler;
}

const compile = (spec: RouteSpec): CompiledRoute => ({
  method: spec.method.toUpperCase(),
  segments: spec.pattern
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') ? { param: seg.slice(1) } : { literal: seg })),
  handler: spec.handler,
});

const match = (route: CompiledRoute, method: string, path: string[]): Record<string, string> | null => {
  if (route.method !== method.toUpperCase()) return null;
  if (route.segments.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < route.segments.length; i++) {
    const seg = route.segments[i];
    const got = path[i];
    if (seg.literal !== undefined && seg.literal !== got) return null;
    if (seg.param !== undefined) params[seg.param] = decodeURIComponent(got);
  }
  return params;
};

export const buildRouter = (specs: RouteSpec[]) => {
  const compiled = specs.map(compile);

  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    // The admin Lambda is wired to `ANY /api/admin/{proxy+}`. We strip the /api/admin/
    // prefix and dispatch on the rest. proxy lives in pathParameters, but rawPath is
    // more reliable when API Gateway adds trailing slashes.
    const rawPath = event.rawPath ?? '';
    const subPath = rawPath.replace(/^\/api\/admin\/?/, '');
    const segments = subPath.split('/').filter(Boolean);
    const method = event.requestContext?.http?.method ?? 'GET';

    for (const route of compiled) {
      const params = match(route, method, segments);
      if (params !== null) {
        return route.handler(event, params);
      }
    }
    return notFound(`No route for ${method} /${segments.join('/')}`);
  };
};
