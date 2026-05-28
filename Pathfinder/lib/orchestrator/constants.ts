// lib/orchestrator/constants.ts
//
// Sprint Z1A — canonical constants for the Zedcor Houston manual orchestrator.

export const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
export const HOUSTON_HUB_SLUG = 'houston';
export const HOUSTON_HUB_ID_UUID = '7afddaff-1b06-428d-94a4-83cf5434e806';

export const ZEDCOR_GEOFENCE_STATES: ReadonlySet<string> = new Set(['TX', 'LA', 'OK', 'AR']);

export const ZEDCOR_NOTION_DB_ID_DEFAULT = '856b43a02b4d43649344c5e1a05d206d';

export const MAX_CANDIDATES_PER_SOURCE = 50;
export const MAX_CANDIDATES_PER_RUN = 600;

export const ORCHESTRATOR_AGENT_NAME = 'zedcor-orchestrator-manual';
