// lib/chat/lead-chat-types.ts
//
// Shared types for the Internal-only Lead Chat Agent. Kept separate from
// the existing chat types (which are Zedcor-shaped: Branch, Project,
// Customer, contextKey, etc.) so the two paths stay decoupled.
//
// Spec: Pathfinder/docs/SPEC-Internal-Rework-V2.md § Stream H.
// Plan: Pathfinder/docs/PLAN-stream-h.md.

import type { ChatSourceCitation } from '@/lib/types';
import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';

export interface LeadChatScope {
  orgSlug: string;
  orgId: string;
  // null company_id means "list scope" (filtered Internal companies).
  // A string company_id means "detail scope" for one Internal company.
  companyId: string | null;
  companyName: string | null;
  filteredCompanyIds: string[];
  // Human-readable label for the ChatContextIndicator chip.
  scopeLabel: string;
}

export type LeadChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface LeadChatMessageRow {
  id: number;
  org_id: string;
  company_id: string | null;
  thread_id: string;
  user_email: string;
  role: LeadChatRole;
  kind: string;
  content: string;
  payload: Record<string, unknown>;
  sources: ChatSourceCitation[] | null;
  tool_name: string | null;
  model_used: string | null;
  latency_ms: number | null;
  created_at: string;
  cleared_at: string | null;
}

export type LeadChatToolName = 'pathfinder_leads' | 'perplexity_sonar';

export type LeadChatSseEvent =
  | { type: 'meta'; threadId: string; scopeLabel: string }
  | { type: 'tool_start'; name: LeadChatToolName; summary?: string }
  | { type: 'tool_done'; name: LeadChatToolName; ok: boolean }
  | { type: 'researching'; provider: 'perplexity-sonar' }
  | { type: 'delta'; text: string }
  | { type: 'sources'; items: ChatSourceCitation[] }
  // SPEC-Chat-Fixes.md defect 3: when the assistant's answer references
  // specific leads (returned by the pathfinder_leads tool), the agent
  // emits the projected CompanyLeadView rows so the panel can render
  // them as inline clickable lead cards under the prose.
  | { type: 'referenced_leads'; items: CompanyLeadView[] }
  | { type: 'done'; latencyMs: number }
  | { type: 'error'; message: string };

export interface LeadChatPostBody {
  org_slug: string;
  company_id?: string | null;
  filtered_company_ids?: string[];
  thread_id: string;
  message: string;
  scope_label: string;
}
