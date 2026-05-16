// Structured JSON logger for CloudWatch. Mirrors secret-share-slack/src/lib/log.ts
// so the metric filters and Logs Insights queries in this repo's Terraform module
// work across all sibling repos uniformly. Never log secret payloads.

export interface LogEvent {
  handler: string;
  outcome: string;
  [key: string]: unknown;
}

export const log = (event: LogEvent): void => {
  console.log(JSON.stringify({ ...event, ts: new Date().toISOString() }));
};
