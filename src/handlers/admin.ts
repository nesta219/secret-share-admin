import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import { buildRouter } from '../lib/router.js';
import { events } from '../routes/events.js';
import { health } from '../routes/health.js';
import { installs } from '../routes/installs.js';
import { integrations } from '../routes/integrations.js';
import { me } from '../routes/me.js';
import { secrets } from '../routes/secrets.js';
import { stats } from '../routes/stats.js';

const router = buildRouter([
  { method: 'GET', pattern: 'me', handler: me },
  { method: 'GET', pattern: 'integrations', handler: integrations },
  { method: 'GET', pattern: 'integrations/:name/installs', handler: installs },
  { method: 'GET', pattern: 'events', handler: events },
  { method: 'GET', pattern: 'stats', handler: stats },
  { method: 'GET', pattern: 'health', handler: health },
  { method: 'GET', pattern: 'secrets', handler: secrets },
]);

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  return router(event);
};
