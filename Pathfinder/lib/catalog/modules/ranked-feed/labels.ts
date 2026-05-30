// lib/catalog/modules/ranked-feed/labels.ts, Stream B Dashboard.
//
// Thin reader over architecture.lead_unit.schema[key].display_label. The
// Internal rework's quality bar is "real values with human labels, never
// raw schema keys", and this is the single chokepoint every Stream B module
// uses to translate a key into a label. If the schema entry is missing the
// display_label (or the entry itself is absent), the key is humanized so a
// misconfiguration cannot leak a raw key like "service_category" into the
// UI.

export type SchemaEntry = {
  display_label?: string;
  type?: string;
  enum_values?: readonly string[];
  required?: boolean;
};

export type LeadUnitSchema = Readonly<Record<string, SchemaEntry>> | undefined;

/**
 * Convert a snake_case or kebab-case key into a human-readable string.
 * "service_category" becomes "Service category". "active-outbound" becomes
 * "Active outbound". The first character is uppercased; the rest stays
 * lowercase so we do not mis-capitalize multi-word labels.
 */
export function humanizeKey(key: string): string {
  if (!key) return '';
  const cleaned = key.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned[0].toUpperCase() + cleaned.slice(1).toLowerCase();
}

/**
 * Resolve the user-facing label for a schema key against a lead_unit.schema.
 * Order of preference:
 *   1. schema[key].display_label (when present, non-empty)
 *   2. humanizeKey(key)
 * Returns the humanized fallback when the schema is undefined or the entry
 * is missing.
 */
export function displayLabel(schema: LeadUnitSchema, key: string): string {
  if (!schema) return humanizeKey(key);
  const entry = schema[key];
  if (entry && typeof entry.display_label === 'string' && entry.display_label.trim() !== '') {
    return entry.display_label;
  }
  return humanizeKey(key);
}
