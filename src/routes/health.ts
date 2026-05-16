import { CloudWatchClient, DescribeAlarmsCommand } from '@aws-sdk/client-cloudwatch';

import { log } from '../lib/log.js';
import { ok, serverError } from '../lib/response.js';

const cw = new CloudWatchClient({});

export const health = async () => {
  const prefix = `secret-share-admin-${process.env.ENVIRONMENT ?? 'dev'}-`;
  try {
    const out = await cw.send(new DescribeAlarmsCommand({ AlarmNamePrefix: prefix }));
    const alarms = (out.MetricAlarms ?? []).map((a) => ({
      name: a.AlarmName ?? null,
      state: a.StateValue ?? 'UNKNOWN',
      reason: a.StateReason ?? null,
      updated_at: a.StateUpdatedTimestamp ? new Date(a.StateUpdatedTimestamp).toISOString() : null,
    }));
    log({ handler: 'health', outcome: 'ok', source: 'admin', alarm_count: alarms.length });
    return ok({ alarms });
  } catch (err) {
    log({
      handler: 'health',
      outcome: 'error',
      source: 'admin',
      error: err instanceof Error ? err.message : String(err),
    });
    return serverError('Health query failed');
  }
};
