import type { SNSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

import { log } from '../lib/log.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface WorkspaceRow {
  team_id?: string;
  bot_token?: string;
  installer_user_id?: string;
}

interface CloudWatchAlarmMessage {
  AlarmName?: string;
  AlarmDescription?: string;
  NewStateValue?: string;
  NewStateReason?: string;
  StateChangeTime?: string;
  Region?: string;
}

// SNS-subscribed. Each SNS record's Message is a JSON-stringified CloudWatch alarm
// payload (because alarms.tf wires the alarm action to this SNS topic). We look up
// the configured alert-target workspace's bot token from the slack repo's
// workspaces-table, then chat.postMessage a DM to the installer.

export const handler = async (event: SNSEvent): Promise<void> => {
  const tableName = process.env.WORKSPACES_TABLE;
  const teamId = process.env.ALERT_TARGET_TEAM_ID;
  if (!tableName || !teamId) {
    log({
      handler: 'slack-relay',
      outcome: 'error',
      reason: 'missing_config',
      have_table: !!tableName,
      have_team_id: !!teamId,
    });
    return;
  }

  let workspace: WorkspaceRow | undefined;
  try {
    const res = await ddb.send(new GetCommand({ TableName: tableName, Key: { team_id: teamId } }));
    workspace = res.Item as WorkspaceRow | undefined;
  } catch (err) {
    log({
      handler: 'slack-relay',
      outcome: 'error',
      reason: 'ddb_lookup_failed',
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (!workspace?.bot_token) {
    log({ handler: 'slack-relay', outcome: 'error', reason: 'no_bot_token', team_id: teamId });
    return;
  }
  if (!workspace.installer_user_id) {
    log({ handler: 'slack-relay', outcome: 'error', reason: 'no_installer_user_id', team_id: teamId });
    return;
  }

  for (const record of event.Records) {
    let alarm: CloudWatchAlarmMessage;
    try {
      alarm = JSON.parse(record.Sns.Message) as CloudWatchAlarmMessage;
    } catch {
      log({ handler: 'slack-relay', outcome: 'error', reason: 'malformed_message', subject: record.Sns.Subject });
      continue;
    }

    const text = formatAlert(alarm);
    try {
      // Open a DM channel first — chat.postMessage to a user-id sometimes needs
      // the conversation opened explicitly. conversations.open is idempotent.
      const openRes = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${workspace.bot_token}`,
        },
        body: JSON.stringify({ users: workspace.installer_user_id }),
      });
      const openJson = (await openRes.json()) as { ok?: boolean; channel?: { id?: string }; error?: string };
      if (!openJson.ok || !openJson.channel?.id) {
        log({ handler: 'slack-relay', outcome: 'error', reason: 'conversations_open_failed', slack_error: openJson.error });
        continue;
      }

      const postRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${workspace.bot_token}`,
        },
        body: JSON.stringify({ channel: openJson.channel.id, text }),
      });
      const postJson = (await postRes.json()) as { ok?: boolean; error?: string };
      if (!postJson.ok) {
        log({
          handler: 'slack-relay',
          outcome: 'error',
          reason: 'chat_post_failed',
          slack_error: postJson.error,
          alarm_name: alarm.AlarmName,
        });
        continue;
      }

      log({
        handler: 'slack-relay',
        outcome: 'ok',
        alarm_name: alarm.AlarmName,
        alarm_state: alarm.NewStateValue,
      });
    } catch (err) {
      log({
        handler: 'slack-relay',
        outcome: 'error',
        reason: 'slack_call_threw',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};

const formatAlert = (alarm: CloudWatchAlarmMessage): string => {
  const emoji = alarm.NewStateValue === 'OK' ? ':white_check_mark:' : ':rotating_light:';
  const lines = [
    `${emoji} *${alarm.AlarmName ?? 'unknown alarm'}* → ${alarm.NewStateValue ?? '?'}`,
  ];
  if (alarm.AlarmDescription) lines.push(`> ${alarm.AlarmDescription}`);
  if (alarm.NewStateReason) lines.push(`\n_${alarm.NewStateReason}_`);
  return lines.join('\n');
};
