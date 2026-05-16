import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

const baseHeaders = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
};

export const ok = <T>(body: T): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 200,
  headers: baseHeaders,
  body: JSON.stringify(body),
});

export const badRequest = (message: string): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 400,
  headers: baseHeaders,
  body: JSON.stringify({ error: message }),
});

export const notFound = (message = 'Not found'): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 404,
  headers: baseHeaders,
  body: JSON.stringify({ error: message }),
});

export const serverError = (message = 'Internal error'): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 500,
  headers: baseHeaders,
  body: JSON.stringify({ error: message }),
});
