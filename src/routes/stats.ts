import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';

import { log } from '../lib/log.js';
import { loadPlatforms } from '../lib/platforms.js';
import { ok, badRequest, serverError } from '../lib/response.js';

const cw = new CloudWatchClient({});

const RANGES: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// GET /api/admin/stats?range=24h
export const stats = async (event: APIGatewayProxyEventV2) => {
  const range = event.queryStringParameters?.range ?? '24h';
  const rangeMs = RANGES[range];
  if (!rangeMs) return badRequest(`Unknown range: ${range}. Use one of ${Object.keys(RANGES).join(', ')}`);

  const namespace = process.env.METRIC_NAMESPACE ?? 'SecretShare/dev';
  const platforms = loadPlatforms();
  const end = new Date();
  const start = new Date(end.getTime() - rangeMs);
  // 5-min period for ≤1d, 1h period beyond. Keeps the response small without losing fidelity.
  const periodSec = rangeMs <= RANGES['24h'] ? 300 : 3600;

  // One query per business metric. CloudWatch supports up to 500 metrics per call;
  // we send ~6 so this is well within limits.
  const queries = [
    { Id: 'created', Label: 'SecretsCreated', MetricName: 'SecretsCreated' },
    { Id: 'retrieved', Label: 'SecretsRetrieved', MetricName: 'SecretsRetrieved' },
    { Id: 'canary', Label: 'CanarySuccess', MetricName: 'CanarySuccess' },
    ...platforms.flatMap((p) => {
      const title = p.name.charAt(0).toUpperCase() + p.name.slice(1);
      const out = [{ Id: `${p.name}_installs`, Label: `${title}Installs`, MetricName: `${title}Installs` }];
      if (p.uninstall_handler) {
        out.push({ Id: `${p.name}_uninstalls`, Label: `${title}Uninstalls`, MetricName: `${title}Uninstalls` });
      }
      return out;
    }),
  ];

  try {
    const out = await cw.send(
      new GetMetricDataCommand({
        StartTime: start,
        EndTime: end,
        ScanBy: 'TimestampAscending',
        MetricDataQueries: queries.map((q) => ({
          Id: q.Id,
          Label: q.Label,
          MetricStat: {
            Metric: { Namespace: namespace, MetricName: q.MetricName },
            Period: periodSec,
            Stat: q.Id === 'canary' ? 'Minimum' : 'Sum',
          },
          ReturnData: true,
        })),
      }),
    );

    const totals: Record<string, number> = {};
    const series: Record<string, Array<[string, number]>> = {};
    for (const r of out.MetricDataResults ?? []) {
      const label = r.Label ?? r.Id ?? 'unknown';
      const values = r.Values ?? [];
      const timestamps = r.Timestamps ?? [];
      totals[label] = values.reduce((a, b) => a + b, 0);
      series[label] = timestamps.map((t, i) => [new Date(t).toISOString(), values[i]]);
    }

    log({ handler: 'stats', outcome: 'ok', source: 'admin', range });
    return ok({ range, namespace, totals, series });
  } catch (err) {
    log({
      handler: 'stats',
      outcome: 'error',
      source: 'admin',
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError('Stats query failed');
  }
};
