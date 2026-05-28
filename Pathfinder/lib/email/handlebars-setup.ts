// lib/email/handlebars-setup.ts
//
// Sprint Z1A — Handlebars configured for the Pathfinder Daily Digest.
// Registers the `eq` helper required by zedcor-digest-template.html
// (used inside phase-tag {{#if (eq phase "closing-soon")}} branches).
//
// Spec: Specs/SPEC-zedcor-digest-template.md §"Template engine: Handlebars".

import Handlebars from 'handlebars';

let registered = false;

function ensureHelpersRegistered(): void {
  if (registered) return;
  Handlebars.registerHelper('eq', function eq(a: unknown, b: unknown): boolean {
    return a === b;
  });
  registered = true;
}

export function renderDigest(templateString: string, data: object): string {
  ensureHelpersRegistered();
  const compiled = Handlebars.compile(templateString, { noEscape: false });
  return compiled(data);
}

export { Handlebars };
