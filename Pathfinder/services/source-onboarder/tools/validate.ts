// services/source-onboarder/tools/validate.ts
//
// Bridge to the canonical-schema validator in lib/adapters. Re-exported so
// agent.ts can import all tool functions from one place.

export { validateNormalizedEvent as validateNormalization } from '@/lib/adapters/socrata';
