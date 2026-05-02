import { readFileSync } from "node:fs";
import { join } from "node:path";
import { callJSON, DEFAULT_SONNET } from "@/lib/anthropic";
import { ResearchOutput } from "../schemas";

let cachedFixtures: Record<string, ResearchOutput> | null = null;

function loadFixtures(): Record<string, ResearchOutput> {
  if (cachedFixtures) return cachedFixtures;
  try {
    const raw = readFileSync(join(process.cwd(), "fixtures/beehive-seed.json"), "utf8");
    cachedFixtures = JSON.parse(raw);
  } catch {
    cachedFixtures = {};
  }
  return cachedFixtures ?? {};
}

function keyForUrl(input: string): string {
  try {
    const u = new URL(input.startsWith("http") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.toLowerCase();
  }
}

export async function research(input_url: string): Promise<ResearchOutput> {
  const fixtures = loadFixtures();
  const hit = fixtures[keyForUrl(input_url)];
  if (hit) return ResearchOutput.parse(hit);

  return callJSON(
    {
      model: DEFAULT_SONNET,
      max_tokens: 500,
      temperature: 0.3,
      system:
        "You are a B2B research agent. Given a company URL, infer a concise structured summary " +
        "based on your general knowledge. If unsure, best-guess with qualifiers. " +
        "Return exactly this JSON shape: " +
        "{company_name, one_line_desc, recent_signal, industry, size_est}.",
      user: `URL: ${input_url}`,
    },
    ResearchOutput,
  );
}
