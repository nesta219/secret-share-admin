import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

import { log } from '../lib/log.js';

const cw = new CloudWatchClient({});

// Triggered by EventBridge every 5 min. POSTs a sentinel secret to /api/put on the
// main app, then GETs it back and asserts the round-trip works. Emits
// `CanarySuccess` to CloudWatch (1.0 on success, 0.0 on any failure). The alarm
// in alarms.tf fires on 2 consecutive zeros.
//
// We send `x-source-app: admin-canary` so the activity log shows these as canary
// hits, not real user traffic — distinct from web/slack/discord rows.

export const handler = async (): Promise<void> => {
  const apiBase = process.env.SECRET_SHARE_API_BASE;
  const namespace = process.env.METRIC_NAMESPACE ?? 'SecretShare/dev';
  const metricName = process.env.CANARY_METRIC_NAME ?? 'CanarySuccess';
  if (!apiBase) {
    log({ handler: 'canary', outcome: 'error', source: 'admin-canary', reason: 'missing_api_base' });
    await emitMetric(0, namespace, metricName);
    return;
  }

  const startedAt = Date.now();
  const probeValue = `__canary__-${startedAt}`;

  try {
    // 1. Create
    const putRes = await fetch(`${apiBase}/api/put`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-source-app': 'admin-canary' },
      body: JSON.stringify({ secret: probeValue }),
    });
    if (!putRes.ok) throw new Error(`put failed: ${putRes.status}`);
    const putBody = (await putRes.json()) as { id?: string };
    const id = putBody.id;
    if (!id) throw new Error('put returned no id');

    // 2. Retrieve (one-time read consumes it)
    const getRes = await fetch(`${apiBase}/api/get/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { 'x-source-app': 'admin-canary' },
    });
    if (!getRes.ok) throw new Error(`get failed: ${getRes.status}`);
    const getBody = (await getRes.json()) as { message?: string; secretFound?: boolean };
    if (!getBody.secretFound) throw new Error('get returned secretFound=false');

    const durationMs = Date.now() - startedAt;
    log({ handler: 'canary', outcome: 'ok', source: 'admin-canary', duration_ms: durationMs });
    await emitMetric(1, namespace, metricName);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    log({
      handler: 'canary',
      outcome: 'error',
      source: 'admin-canary',
      duration_ms: durationMs,
      error: err instanceof Error ? err.message : String(err),
    });
    await emitMetric(0, namespace, metricName);
  }
};

const emitMetric = async (value: number, namespace: string, metricName: string): Promise<void> => {
  try {
    await cw.send(
      new PutMetricDataCommand({
        Namespace: namespace,
        MetricData: [{ MetricName: metricName, Value: value, Unit: 'None', Timestamp: new Date() }],
      }),
    );
  } catch (err) {
    // If PutMetricData itself fails, the alarm's `treat_missing_data = breaching`
    // takes over and the canary-failure alarm fires anyway. Log it for debugging.
    console.error('canary metric emit failed:', err);
  }
};
