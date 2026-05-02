// lib/connectors/manifests/slack.ts — per-org Slack app manifest generator.
//
// SPEC § 3.4 (Multi-tenant manifest generation): Slack and Teams support
// per-tenant apps without going through the public app store for pilots.
// This file builds the YAML manifest the Slack admin imports at
// `https://api.slack.com/apps?new_app=1&manifest_yaml=<encoded>`.
//
// Customization per org:
//   • display_information.name             → "Pathfinder ({orgId})"
//   • bot_user.display_name                → same
//   • oauth_config.scopes                  → from C-1A providers.ts
//   • event_subscriptions.request_url      → /api/connectors/slack/events
//   • slash_commands                       → C-1B's `/pathfinder` verbs
//   • interactivity.request_url            → /api/connectors/slack/events
//
// Security:
//   • The manifest body is non-secret. The signing-secret + bot tokens
//     stay in env on the Pathfinder side; Slack mints them after the
//     admin clicks "Install to Workspace".
//   • `org_id` is included only as a slug in the app name so the admin
//     can tell installations apart. No customer PII / no token material.

import { dump as yamlDump } from 'js-yaml';

import { getProvider } from '@/lib/connectors/providers';

export interface SlackManifestArgs {
  /** Customer org id (slugged in the app name + audit). */
  orgId: string;
  /** Pathfinder origin (e.g. https://www.unicron.systems/pathfinder). */
  baseUrl: string;
}

export interface GeneratedSlackManifest {
  format: 'yaml';
  body: string;
  /** The manifest object (pre-serialization) — exposed for tests + JSON export. */
  manifest: SlackManifestObject;
}

/** Slack manifest schema — partial typing of fields we generate. */
export interface SlackManifestObject {
  display_information: {
    name: string;
    description: string;
    background_color: string;
    long_description: string;
  };
  features: {
    bot_user: { display_name: string; always_online: boolean };
    slash_commands: Array<{
      command: string;
      url: string;
      description: string;
      usage_hint: string;
      should_escape: boolean;
    }>;
  };
  oauth_config: {
    redirect_urls: string[];
    scopes: { bot: string[] };
  };
  settings: {
    event_subscriptions: {
      request_url: string;
      bot_events: string[];
    };
    interactivity: {
      is_enabled: boolean;
      request_url: string;
    };
    org_deploy_enabled: boolean;
    socket_mode_enabled: boolean;
    token_rotation_enabled: boolean;
  };
  _metadata: {
    major_version: number;
    minor_version: number;
  };
}

/**
 * Slash-command catalogue — single-sourced here so C-1B's parser (which
 * accepts `leads`, `rejected`, `feedback`, `help` as the first token of
 * `/pathfinder <verb>`) and the manifest registration stay in lockstep.
 *
 * Slack's manifest format requires one entry per command keyword. We
 * register the parent `/pathfinder` slash and let the parser route the
 * subverbs server-side, which matches the parser contract in
 * `lib/connectors/slack/commands.ts`.
 */
const SLASH_COMMANDS: Array<{
  command: string;
  description: string;
  usage_hint: string;
}> = [
  {
    command: '/pathfinder',
    description: 'Query Pathfinder leads, rejected pile, and feedback',
    usage_hint: 'leads | rejected | feedback <project_id> <up|down> [reason] | help',
  },
];

/** Bot-token scopes that map to event subscriptions + outbound features. */
const BOT_EVENTS = ['app_mention', 'message.im', 'reaction_added'];

/** Validate the org slug. SPEC § 5.1 multi-tenant isolation — never let a
 *  caller smuggle whitespace / control chars into the manifest body. */
function assertSafeOrgId(orgId: string): void {
  if (typeof orgId !== 'string' || orgId.length === 0) {
    throw new Error('orgId is required');
  }
  if (orgId.length > 64) {
    throw new Error('orgId must be ≤ 64 chars');
  }
  if (!/^[a-z0-9_-]+$/i.test(orgId)) {
    throw new Error('orgId must match [a-z0-9_-]+');
  }
}

/** Validate the base URL. Must be a parseable absolute https URL — Slack
 *  rejects manifests that point at non-https endpoints in production. */
function assertSafeBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('baseUrl must be a valid absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error('baseUrl must be https (localhost exempted for dev)');
  }
  return parsed;
}

/**
 * Build the per-org Slack manifest object. Returns both the structured
 * object (for tests + JSON serialization) and the YAML body Slack expects.
 */
export function generateSlackManifest(args: SlackManifestArgs): GeneratedSlackManifest {
  assertSafeOrgId(args.orgId);
  const url = assertSafeBaseUrl(args.baseUrl);

  const provider = getProvider('slack');
  const origin = `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;
  const eventsUrl = `${origin}/api/connectors/slack/events`;
  const callbackUrl = `${origin}/api/connectors/slack/callback`;

  const manifest: SlackManifestObject = {
    display_information: {
      name: `Pathfinder (${args.orgId})`,
      description: 'Lead intelligence for construction security',
      background_color: '#0a0a0a',
      long_description:
        'Pathfinder surfaces high-priority construction leads, daily briefs, ' +
        'and rejected-pile context inside Slack. Slash commands route directly ' +
        'into the Pathfinder agent stack; reaction-feedback feeds the ranker.',
    },
    features: {
      bot_user: {
        display_name: `Pathfinder (${args.orgId})`,
        always_online: true,
      },
      slash_commands: SLASH_COMMANDS.map((c) => ({
        command: c.command,
        url: `${origin}/api/connectors/slack/commands`,
        description: c.description,
        usage_hint: c.usage_hint,
        should_escape: false,
      })),
    },
    oauth_config: {
      redirect_urls: [callbackUrl],
      scopes: {
        bot: [...provider.scopes],
      },
    },
    settings: {
      event_subscriptions: {
        request_url: eventsUrl,
        bot_events: [...BOT_EVENTS],
      },
      interactivity: {
        is_enabled: true,
        request_url: eventsUrl,
      },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
    _metadata: {
      major_version: 1,
      minor_version: 1,
    },
  };

  // js-yaml `dump` with default options produces a manifest that round-
  // trips through Slack's parser. `lineWidth: -1` disables soft-wrap so
  // long URLs aren't broken across lines.
  const body = yamlDump(manifest, { lineWidth: -1, noRefs: true });

  return { format: 'yaml', body, manifest };
}

/** Convenience: filename for the downloaded manifest. */
export function slackManifestFilename(orgId: string): string {
  assertSafeOrgId(orgId);
  return `pathfinder-slack-${orgId}.yaml`;
}
