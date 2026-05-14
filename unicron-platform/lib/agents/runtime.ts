// lib/agents/runtime.ts — Sprint 2 Stream B
// Persistent agent runtime — shared by Orchestrator, Analyst, Elder, Taboo Keeper.
//
// Responsibilities:
//   - loadAgentMemory: reads today's daily log + index from the vault (GitHub raw content API)
//   - writeAgentMemory: appends an entry to the agent's daily log in the vault
//   - checkBudget: throws if the agent's Supabase budget row is exhausted
//   - runAgent: wraps any agent function with memory load/write, budget check, audit log

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Memory I/O
// ---------------------------------------------------------------------------

/**
 * Load agent's memory from the vault (GitHub raw content API).
 * Returns today's daily log + index file content, separated by a divider.
 * Returns empty string if both files are missing.
 */
export async function loadAgentMemory(agentName: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const token = process.env.GITHUB_VAULT_TOKEN!;
  const repo = 'freakngenius/unicron-knowledge';

  const paths = [
    `wiki/memory/${agentName}/${today}.md`,
    `wiki/memory/${agentName}/index.md`,
  ];

  const contents = await Promise.all(
    paths.map(async (path) => {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/${path}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3.raw',
          },
        }
      );
      if (res.status === 404) return '';
      if (!res.ok) {
        console.warn(`[runtime] loadAgentMemory: unexpected status ${res.status} for ${path}`);
        return '';
      }
      return res.text();
    })
  );

  return contents.filter(Boolean).join('\n\n---\n\n');
}

/**
 * Append an entry to the agent's daily log in the vault.
 * Creates the file if it does not yet exist; appends with a divider if it does.
 *
 * `forDate` (YYYY-MM-DD) explicitly names the date the entry is *for*. When
 * the analyst's nightly cron fires on day D and aggregates day D-1, it should
 * pass forDate=D-1 so the digest lives at .../analyst/<D-1>.md, matching what
 * the UI looks up when an operator selects "yesterday". Omit forDate to keep
 * the legacy behavior (path uses the server's current UTC date).
 */
export async function writeAgentMemory(
  agentName: string,
  entry: string,
  forDate?: string,
): Promise<{ path: string; status: number }> {
  const today = new Date().toISOString().split('T')[0];
  const pathDate = forDate ?? today;
  const token = process.env.GITHUB_VAULT_TOKEN!;
  const repo = 'freakngenius/unicron-knowledge';
  const path = `wiki/memory/${agentName}/${pathDate}.md`;

  // Fetch current file to get SHA and existing content
  const getRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  let currentContent = '';
  let fileSha: string | undefined;

  if (getRes.ok) {
    const file = (await getRes.json()) as { content: string; sha: string };
    currentContent = Buffer.from(file.content, 'base64').toString('utf-8');
    fileSha = file.sha;
  }

  const newContent = currentContent
    ? `${currentContent}\n\n---\n\n${entry}`
    : `---\ntype: memory\nagent: ${agentName}\ndate: ${pathDate}\n---\n\n${entry}`;

  const body: Record<string, unknown> = {
    message: `memory(${agentName}): daily log ${pathDate}`,
    content: Buffer.from(newContent).toString('base64'),
    committer: { name: 'Unicron Agent', email: 'agent@unicron.systems' },
  };
  if (fileSha) body.sha = fileSha;

  const putRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!putRes.ok) {
    const detail = await putRes.text();
    console.error(`[runtime] writeAgentMemory failed for ${agentName}: ${putRes.status} — ${detail}`);
  }
  return { path, status: putRes.status };
}

// ---------------------------------------------------------------------------
// Budget enforcement
// ---------------------------------------------------------------------------

interface AgentBudget {
  limit_usd_per_period: number;
  current_spent_usd: number;
}

interface AgentRow {
  name: string;
  budget: AgentBudget | null;
}

/**
 * Check agent budget; throw if current spend >= limit.
 */
async function checkBudget(agentId: string): Promise<void> {
  const { data } = await supabase
    .from('agents')
    .select('budget, name')
    .eq('id', agentId)
    .single<AgentRow>();

  if (!data?.budget) return;

  const { limit_usd_per_period, current_spent_usd } = data.budget;
  if (current_spent_usd >= limit_usd_per_period) {
    throw new Error(
      `Agent ${data.name} budget exceeded: $${current_spent_usd}/$${limit_usd_per_period}`
    );
  }
}

// ---------------------------------------------------------------------------
// Agent runner
// ---------------------------------------------------------------------------

interface AgentIdentity {
  id: string;
  budget: AgentBudget | null;
}

/**
 * Run an agent function with memory load/write, budget check, audit log, and ledger writes.
 *
 * @param agentName  - Name matching the `agents.name` column in Supabase
 * @param inputs     - Serialisable input payload (summary written to audit_log)
 * @param agentFn    - The agent's core logic; receives inputs + loaded memory
 */
export async function runAgent<TInput, TOutput>(
  agentName: string,
  inputs: TInput,
  agentFn: (inputs: TInput, memory: string) => Promise<TOutput>
): Promise<TOutput> {
  // Resolve agent row for budget + audit purposes
  const { data: agent } = await supabase
    .from('agents')
    .select('id, budget')
    .eq('name', agentName)
    .single<AgentIdentity>();

  if (agent) await checkBudget(agent.id);

  const memory = await loadAgentMemory(agentName);

  // Ledger: run_started
  if (agent) {
    await supabase.schema('nervous_system').from('ledger').insert({
      source_type: 'agent_run',
      created_by_agent: agent.id,
      content_summary: `run_started: ${agentName}`,
      status: 'active',
    });
  }

  let output: TOutput;
  try {
    output = await agentFn(inputs, memory);
  } catch (err) {
    // Ledger: run_errored
    if (agent) {
      await supabase.schema('nervous_system').from('ledger').insert({
        source_type: 'agent_run',
        created_by_agent: agent.id,
        content_summary: `run_errored: ${agentName} — ${err instanceof Error ? err.message : String(err)}`,
        status: 'archived',
      });
    }
    throw err;
  }

  // Write audit log entry + ledger: run_completed
  if (agent) {
    await Promise.all([
      supabase.from('audit_log').insert({
        table_name: 'agents',
        action: 'agent_run',
        actor_id: agent.id,
        payload: {
          agent_name: agentName,
          inputs_summary: JSON.stringify(inputs).slice(0, 200),
        },
      }),
      supabase.schema('nervous_system').from('ledger').insert({
        source_type: 'agent_run',
        created_by_agent: agent.id,
        content_summary: `run_completed: ${agentName}`,
        status: 'active',
      }),
    ]);
  }

  return output;
}
