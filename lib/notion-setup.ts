import { assertServer } from "./server-guard";
assertServer("lib/notion-setup");
import { notion, productPageId } from "./notion";
import { getNotionDbId, setNotionDbId, type NotionKey } from "./notion-ids";
import { logger } from "./logger";

type DbSpec = {
  key: NotionKey;
  title: string;
  properties: Record<string, unknown>;
};

const SPECS: DbSpec[] = [
  {
    key: "signals",
    title: "Signals (Mycelium)",
    properties: {
      Topic: { title: {} },
      Type: {
        select: {
          options: [
            { name: "FACT", color: "green" },
            { name: "QUESTION", color: "blue" },
            { name: "PATTERN", color: "purple" },
            { name: "RISK", color: "red" },
          ],
        },
      },
      Source: {
        select: {
          options: [
            { name: "CEO" }, { name: "Research" }, { name: "CMO" },
            { name: "Kyle" }, { name: "Keenan" },
          ],
        },
      },
      Body: { rich_text: {} },
      Strength: { number: { format: "number" } },
      "Last Touched": { date: {} },
      Created: { date: {} },
      "Signal ID": { rich_text: {} },
    },
  },
  {
    key: "pipeline_runs",
    title: "Pipeline Runs (Beehive)",
    properties: {
      "Input URL": { title: {} },
      Status: {
        select: {
          options: [
            { name: "succeeded", color: "green" },
            { name: "failed", color: "red" },
            { name: "running", color: "yellow" },
          ],
        },
      },
      Subject: { rich_text: {} },
      "Final Email": { rich_text: {} },
      "Completed At": { date: {} },
      "Run ID": { rich_text: {} },
    },
  },
  {
    key: "swarm_jobs",
    title: "Swarm Jobs (Ant Colony)",
    properties: {
      Market: { title: {} },
      "Target Count": { number: { format: "number" } },
      Clusters: { rich_text: {} },
      "Completed At": { date: {} },
      "Job ID": { rich_text: {} },
    },
  },
  {
    key: "flock_runs",
    title: "Flock Runs (Murmuration)",
    properties: {
      Prompt: { title: {} },
      Cycles: { number: { format: "number" } },
      "Top Variants": { rich_text: {} },
      Convergence: { number: { format: "number" } },
      "Run ID": { rich_text: {} },
    },
  },
  {
    key: "vertical_decisions",
    title: "Vertical Decisions (Slime Mold)",
    properties: {
      Hypothesis: { title: {} },
      "Composite Score": { number: { format: "number" } },
      TAM: { rich_text: {} },
      Reasoning: { rich_text: {} },
      Cycle: { number: { format: "number" } },
      "Run ID": { rich_text: {} },
    },
  },
];

export async function setupNotionDatabases(opts: { force?: boolean } = {}): Promise<Record<NotionKey, string>> {
  const result = {} as Record<NotionKey, string>;
  const parent = productPageId();
  for (const spec of SPECS) {
    const existing = opts.force ? null : await getNotionDbId(spec.key);
    if (existing) {
      logger.info("notion.db.cached", { key: spec.key, database_id: existing });
      result[spec.key] = existing;
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await notion().databases.create({
      parent: { type: "page_id", page_id: parent },
      title: [{ type: "text", text: { content: spec.title } }],
      properties: spec.properties as any,
    } as any);
    result[spec.key] = db.id;
    await setNotionDbId(spec.key, db.id);
    logger.info("notion.db.created", { key: spec.key, database_id: db.id, title: spec.title });
  }
  return result;
}
