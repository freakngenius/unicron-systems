// tests/connectors/manifest-slack.test.ts — Slack manifest generator.
//
// Covers:
//   • Required-field shape (display_information, oauth_config.scopes,
//     event_subscriptions.request_url, slash_commands).
//   • Scope list matches `lib/connectors/providers.ts` (single source of
//     truth — manifest must not drift from the OAuth start scopes).
//   • YAML body round-trips back through js-yaml without info loss.
//   • Org id + base URL validation reject malformed input.

import { describe, it, expect } from 'vitest';
import { load as yamlLoad } from 'js-yaml';

import { getProvider } from '@/lib/connectors/providers';
import {
  generateSlackManifest,
  slackManifestFilename,
} from '@/lib/connectors/manifests/slack';

describe('generateSlackManifest', () => {
  it('produces a manifest with the required Slack schema fields', () => {
    const { manifest } = generateSlackManifest({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    expect(manifest.display_information.name).toBe('Pathfinder (zedcor)');
    expect(manifest.display_information.description.length).toBeGreaterThan(0);
    expect(manifest.features.bot_user.display_name).toBe('Pathfinder (zedcor)');
    expect(manifest.features.slash_commands.length).toBeGreaterThan(0);
    expect(manifest.oauth_config.redirect_urls).toEqual([
      'https://www.unicron.systems/pathfinder/api/connectors/slack/callback',
    ]);
    expect(manifest.settings.event_subscriptions.request_url).toBe(
      'https://www.unicron.systems/pathfinder/api/connectors/slack/events',
    );
    expect(manifest.settings.interactivity.is_enabled).toBe(true);
  });

  it('mirrors the bot scopes from providers.ts so OAuth and manifest stay in sync', () => {
    const provider = getProvider('slack');
    const { manifest } = generateSlackManifest({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    expect(manifest.oauth_config.scopes.bot).toEqual(provider.scopes);
  });

  it('registers the /pathfinder slash command pointing at the commands route', () => {
    const { manifest } = generateSlackManifest({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    const cmds = manifest.features.slash_commands;
    expect(cmds.some((c) => c.command === '/pathfinder')).toBe(true);
    for (const cmd of cmds) {
      expect(cmd.url).toBe(
        'https://www.unicron.systems/pathfinder/api/connectors/slack/commands',
      );
    }
  });

  it('emits YAML body that round-trips through js-yaml.load', () => {
    const { body, manifest } = generateSlackManifest({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    const parsed = yamlLoad(body) as typeof manifest;
    expect(parsed.display_information.name).toBe(manifest.display_information.name);
    expect(parsed.oauth_config.scopes.bot).toEqual(manifest.oauth_config.scopes.bot);
    expect(parsed.settings.event_subscriptions.bot_events).toEqual(
      manifest.settings.event_subscriptions.bot_events,
    );
  });

  it('does not leak the slack signing secret or bot token in the body', () => {
    process.env.SLACK_SIGNING_SECRET = 'super-secret-test-value';
    process.env.SLACK_CLIENT_SECRET = 'super-secret-client';
    const { body } = generateSlackManifest({
      orgId: 'zedcor',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    expect(body).not.toContain('super-secret-test-value');
    expect(body).not.toContain('super-secret-client');
  });

  it('rejects an empty or invalid org id', () => {
    expect(() =>
      generateSlackManifest({ orgId: '', baseUrl: 'https://www.unicron.systems' }),
    ).toThrow();
    expect(() =>
      generateSlackManifest({
        orgId: 'has spaces',
        baseUrl: 'https://www.unicron.systems',
      }),
    ).toThrow();
    expect(() =>
      generateSlackManifest({
        orgId: 'a'.repeat(65),
        baseUrl: 'https://www.unicron.systems',
      }),
    ).toThrow();
  });

  it('rejects non-https base URLs except localhost', () => {
    expect(() =>
      generateSlackManifest({ orgId: 'zedcor', baseUrl: 'http://evil.example.com' }),
    ).toThrow();
    // localhost dev exemption.
    expect(() =>
      generateSlackManifest({ orgId: 'zedcor', baseUrl: 'http://localhost:3000' }),
    ).not.toThrow();
  });

  it('produces a per-org filename for downloads', () => {
    expect(slackManifestFilename('zedcor')).toBe('pathfinder-slack-zedcor.yaml');
    expect(() => slackManifestFilename('')).toThrow();
  });

  it('isolates org id in the manifest body so cross-tenant downloads stay distinct', () => {
    const a = generateSlackManifest({
      orgId: 'tenant-a',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    const b = generateSlackManifest({
      orgId: 'tenant-b',
      baseUrl: 'https://www.unicron.systems/pathfinder',
    });
    expect(a.manifest.display_information.name).not.toBe(b.manifest.display_information.name);
    expect(a.body).not.toContain('tenant-b');
    expect(b.body).not.toContain('tenant-a');
  });
});
