// lib/catalog/modules/metrics-view/labels.ts, Stream F.
//
// Plain-language labels and tooltip text for the metrics view. Each entry
// is what a salesperson reads on the card title and inside the tooltip
// glyph. The strings live here so a copy change is a single-file edit.

export interface MetricCopy {
  label: string;
  suffix?: string;
  tooltip: string;
}

export const METRIC_COPY: Record<string, MetricCopy> = {
  verified_count_1d: {
    label: 'Companies verified today',
    tooltip:
      'How many companies the system confirmed today as good-fit leads (passed the verification threshold).',
  },
  active_outbound_motion: {
    label: 'Active outbound motion',
    suffix: '%',
    tooltip:
      "Share of companies with evidence of an active sales team or outbound hiring. 'Unknown' means enrichment has not yet confirmed motion, not that no motion exists.",
  },
  avg_score_out_of_100: {
    label: 'Average sales priority',
    suffix: '/100',
    tooltip: 'Average lead score across companies with a score, on a 0 to 100 scale.',
  },
  sources_live: {
    label: 'Sources live',
    tooltip: 'How many data sources are currently feeding leads, out of those registered.',
  },
};

export const METRIC_IDS: readonly string[] = Object.keys(METRIC_COPY);
