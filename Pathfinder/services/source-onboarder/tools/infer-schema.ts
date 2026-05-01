// services/source-onboarder/tools/infer-schema.ts
//
// Builds a JSON-schema-ish description from sample records. Used by the
// agent to pass schema context into generateAdapterCode and into the
// data_sources.metadata column for human inspection.

export interface InferredSchema {
  type: 'object' | 'array' | 'unknown';
  fields: Record<string, FieldInfo>;
  sampleSize: number;
  arrayOfRecords: boolean;
}

export interface FieldInfo {
  types: string[];               // 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'
  presenceRatio: number;         // 0..1
  examples: unknown[];           // up to 3
  nestedSchema?: InferredSchema; // for objects
}

const MAX_EXAMPLES = 3;
const MAX_FIELDS = 200;

export function inferSchema(samples: unknown[]): InferredSchema {
  if (!Array.isArray(samples) || samples.length === 0) {
    return { type: 'unknown', fields: {}, sampleSize: 0, arrayOfRecords: false };
  }
  const records = samples.filter((s) => s !== null && typeof s === 'object' && !Array.isArray(s)) as Record<string, unknown>[];
  if (records.length === 0) {
    return { type: 'unknown', fields: {}, sampleSize: samples.length, arrayOfRecords: false };
  }
  const fields: Record<string, FieldInfo> = {};
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      if (Object.keys(fields).length >= MAX_FIELDS && !(k in fields)) continue;
      const info = fields[k] ?? { types: [], presenceRatio: 0, examples: [] };
      const t = typeOf(v);
      if (!info.types.includes(t)) info.types.push(t);
      info.presenceRatio += 1;
      if (info.examples.length < MAX_EXAMPLES && v !== null && v !== undefined) {
        info.examples.push(truncateExample(v));
      }
      fields[k] = info;
    }
  }
  for (const [k, info] of Object.entries(fields)) {
    info.presenceRatio = info.presenceRatio / records.length;
    fields[k] = info;
  }
  return {
    type: 'array',
    fields,
    sampleSize: records.length,
    arrayOfRecords: true,
  };
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function truncateExample(v: unknown): unknown {
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  if (typeof v === 'object' && v !== null) {
    try {
      const json = JSON.stringify(v);
      return json.length > 400 ? json.slice(0, 400) + '…' : v;
    } catch {
      return '<unserialisable>';
    }
  }
  return v;
}
