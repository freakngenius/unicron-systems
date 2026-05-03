// app/api/leads/[projectId]/outreach/draft/route.ts — Demo Polish UX
// Gate 9C, sender wiring added in Gate 12D. Powers the "Draft
// recommended outreach" button on the v2 lead detail page. Spec:
// SPEC - Lead Detail Page v2.md § "Outreach Drafter LLM contract".
//
// Auth: relies on the upstream basic-auth gate (middleware.ts). Body
// optionally includes a contact_id to pin the draft to a specific
// decision-maker; when omitted, the drafter uses the highest-confidence
// contact already enriched for this lead. Body may also include an
// actor_email override; otherwise the route falls back to
// PF_DEMO_OPERATOR_EMAIL so the sender first name in the sign-off is
// real.

import { NextResponse, type NextRequest } from 'next/server';

import {
  generateV2Draft,
  senderFirstNameFromEmail,
  type V2DraftContext,
  type V2DraftSender,
} from '@/lib/outreach/anthropic-drafter';
import { resolveActiveConnection } from '@/lib/outreach/user-connection';
import { supabase } from '@/lib/supabase';
import type { LeadContactRow, Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

const DEMO_OPERATOR_EMAIL =
  process.env.PF_DEMO_OPERATOR_EMAIL ?? 'kyle@freakngenius.com';

interface DraftRequestBody {
  contact_id?: string;
  actor_email?: string;
}

interface ZedcorBranchInfo {
  id: string;
  branch_name: string;
  state: string;
}

interface CrossPollRow {
  customer_canonical: string;
  match_confidence: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const projectId = decodeURIComponent(params.projectId);

  let body: DraftRequestBody = {};
  try {
    const json = (await req.json()) as DraftRequestBody;
    if (json && typeof json === 'object') body = json;
  } catch {
    // Empty / non-JSON body is fine — defaults to no contact pin.
  }
  const contactId =
    typeof body.contact_id === 'string' && body.contact_id.length > 0
      ? body.contact_id
      : null;
  const actorEmail =
    typeof body.actor_email === 'string' && body.actor_email.length > 0
      ? body.actor_email
      : DEMO_OPERATOR_EMAIL;

  const [projectRes, contactsRes, crossPollRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
    supabase
      .from('lead_contacts')
      .select('*')
      .eq('project_id', projectId)
      .order('source_confidence', { ascending: false }),
    supabase
      .from('lead_cross_pollination')
      .select('customer_canonical, match_confidence')
      .eq('lead_id', projectId)
      .order('match_confidence', { ascending: false })
      .limit(1),
  ]);

  const project = projectRes.data as Project | null;
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  const contacts = (contactsRes.data ?? []) as LeadContactRow[];
  const crossPoll = (crossPollRes.data ?? []) as unknown as CrossPollRow[];

  // Pick the contact: explicit contact_id takes precedence, then the
  // highest-confidence enriched contact, then null (drafter writes
  // generically by role).
  let pinnedContact: LeadContactRow | null = null;
  if (contactId) {
    pinnedContact = contacts.find((c) => c.id === contactId) ?? null;
  }
  if (!pinnedContact && contacts.length > 0) {
    pinnedContact = contacts[0];
  }

  // Resolve nearest Zedcor branch for the prompt's branch context.
  let branch: ZedcorBranchInfo | null = null;
  if (project.nearest_zedcor_branch_id) {
    const { data: branchRow } = await supabase
      .from('zedcor_branches')
      .select('id, branch_name, state')
      .eq('id', project.nearest_zedcor_branch_id)
      .maybeSingle();
    if (branchRow) branch = branchRow as unknown as ZedcorBranchInfo;
  }

  // Gate 12D — resolve sender identity so the model can sign the email
  // with the operator's actual first name. Falls back to null when no
  // connection exists; the system prompt then signs off with "Best,".
  let sender: V2DraftSender | null = null;
  const conn = await resolveActiveConnection(actorEmail);
  if (conn?.email) {
    const firstName = senderFirstNameFromEmail(conn.email);
    if (firstName) {
      sender = { firstName, email: conn.email, provider: conn.provider };
    }
  }

  const ctx: V2DraftContext = {
    project: {
      id: project.id,
      title: project.title,
      rationale: project.rationale ?? null,
      project_value: project.project_value ?? null,
      distance_miles:
        project.zedcor_distance_miles ?? project.distance_miles ?? null,
      posted_date: project.posted_date ?? null,
      // Procurement deadline isn't a canonical column on projects yet
      // (nothing in lib/types.ts surfaces an RFP due date). Use the
      // estimated_start_date as the next-best timing signal so the
      // model has something concrete to anchor "before X" against.
      deadline: project.estimated_start_date ?? null,
      naics:
        project.naics_code && project.naics_description
          ? `${project.naics_code} (${project.naics_description})`
          : project.naics_code ?? project.naics_description ?? null,
    },
    branch: branch
      ? { name: branch.branch_name, state: branch.state }
      : null,
    contact: pinnedContact
      ? {
          name: pinnedContact.contact_name ?? null,
          role: pinnedContact.role ?? null,
          organization:
            pinnedContact.owner_organization ??
            project.owner_name ??
            null,
          email: pinnedContact.email ?? null,
        }
      : project.owner_name
        ? {
            name: null,
            role: null,
            organization: project.owner_name,
            email: null,
          }
        : null,
    warmIntroCustomer:
      crossPoll.length > 0 ? crossPoll[0].customer_canonical : null,
    sender,
  };

  try {
    const draft = await generateV2Draft(ctx);
    // If the drafter didn't surface a recipient, fall back to the pinned
    // contact's email so the composer still pre-fills.
    const fallbackEmail = pinnedContact?.email ?? null;
    return NextResponse.json({
      subject: draft.subject,
      body: draft.body,
      suggested_recipient_email:
        draft.suggested_recipient_email ?? fallbackEmail,
      contact_id: pinnedContact?.id ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'drafter failed';
    return NextResponse.json(
      { error: message, code: 'drafter_failed' },
      { status: 502 },
    );
  }
}
