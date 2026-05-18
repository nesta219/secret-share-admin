import { describe, it, expect } from 'vitest';

import { belongsToEnv } from '../routes/events.js';

describe('belongsToEnv (cross-env log-group filter)', () => {
  it('accepts platform log groups ending with -<env>', () => {
    expect(belongsToEnv('/aws/lambda/slack-app-command-production', 'production')).toBe(true);
    expect(belongsToEnv('/aws/lambda/discord-app-oauth-callback-dev', 'dev')).toBe(true);
  });

  it('accepts main-app log groups with -<env>- as a segment', () => {
    expect(belongsToEnv('/aws/lambda/secret-share-backend-production-putItemFunction', 'production')).toBe(true);
    expect(belongsToEnv('/aws/lambda/secret-share-backend-dev-getByIdFunction', 'dev')).toBe(true);
  });

  it('rejects the other env to prevent cross-env data leaks', () => {
    // This is the bug that took down prod admin's /activity route — DescribeLogGroups
    // with prefix `/aws/lambda/slack-app-` returns BOTH envs' groups in one call.
    expect(belongsToEnv('/aws/lambda/slack-app-command-dev', 'production')).toBe(false);
    expect(belongsToEnv('/aws/lambda/slack-app-command-production', 'dev')).toBe(false);
    expect(belongsToEnv('/aws/lambda/secret-share-backend-dev-putItemFunction', 'production')).toBe(false);
  });

  it('returns true when env is empty (no filtering configured)', () => {
    expect(belongsToEnv('/aws/lambda/whatever', '')).toBe(true);
  });
});
