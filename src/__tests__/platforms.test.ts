import { describe, it, expect, beforeEach } from 'vitest';

import { loadPlatforms, findPlatform, projectSafe } from '../lib/platforms.js';

const slack = {
  name: 'slack',
  display_name: 'Slack',
  table_name: 'workspaces-table-test',
  table_arn: 'arn:test',
  hash_key: 'team_id',
  display_name_field: 'team_name',
  type_discriminator: '',
  safe_fields: ['team_id', 'team_name', 'installed_at', 'plan'],
  sensitive_fields: ['bot_token'],
  log_group_prefix: '/aws/lambda/slack-app-',
  install_handler: 'oauth-callback',
  uninstall_handler: 'events',
  uninstall_event_type: 'app_uninstalled',
};

const discord = {
  name: 'discord',
  display_name: 'Discord',
  table_name: 'installs-table-test',
  table_arn: 'arn:test',
  hash_key: 'install_id',
  display_name_field: 'guild_name',
  type_discriminator: 'install_type',
  safe_fields: ['install_id', 'install_type', 'guild_name', 'installed_at', 'plan'],
  sensitive_fields: [],
  log_group_prefix: '/aws/lambda/discord-app-',
  install_handler: 'oauth-callback',
  uninstall_handler: '',
  uninstall_event_type: '',
};

beforeEach(() => {
  // Reset the module-level cache between tests by re-importing — Vitest's vi.resetModules
  // would be cleaner but this test file's expectations are small enough to manage manually.
  // We set the env directly and the next loadPlatforms() will use it if not cached.
  process.env.PLATFORMS_JSON = JSON.stringify([slack, discord]);
});

describe('platforms', () => {
  it('parses and returns the configured platforms', () => {
    const ps = loadPlatforms();
    expect(ps).toHaveLength(2);
    expect(ps.map((p) => p.name)).toEqual(['slack', 'discord']);
  });

  it('findPlatform returns null for unknown', () => {
    expect(findPlatform('teams')).toBeNull();
  });

  it('projectSafe strips bot_token from a slack row', () => {
    const raw = {
      team_id: 'T123',
      team_name: 'Demo',
      bot_token: 'xoxb-very-secret',
      installer_user_id: 'U456',
      installed_at: '2026-01-01T00:00:00Z',
      plan: 'free',
    };
    const out = projectSafe(slack, raw);
    expect(out).not.toHaveProperty('bot_token');
    expect(out.team_id).toBe('T123');
    expect(out.team_name).toBe('Demo');
  });

  it('projectSafe never returns fields outside safe_fields', () => {
    const raw = {
      team_id: 'T123',
      team_name: 'Demo',
      bot_token: 'xoxb-secret',
      undisclosed_internal_field: 'sensitive',
      installed_at: '2026-01-01T00:00:00Z',
      plan: 'free',
    };
    const out = projectSafe(slack, raw);
    expect(out).not.toHaveProperty('undisclosed_internal_field');
    expect(Object.keys(out).sort()).toEqual(['installed_at', 'plan', 'team_id', 'team_name']);
  });

  it('projectSafe handles platforms with no sensitive fields (discord)', () => {
    const raw = {
      install_id: 'G789',
      install_type: 'guild',
      guild_name: 'My Guild',
      installer_user_id: 'U999',
      installed_at: '2026-01-01T00:00:00Z',
      plan: 'free',
    };
    const out = projectSafe(discord, raw);
    expect(out.install_id).toBe('G789');
    expect(out.install_type).toBe('guild');
    expect(out.guild_name).toBe('My Guild');
  });
});
