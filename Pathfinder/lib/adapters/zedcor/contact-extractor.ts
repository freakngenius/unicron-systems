// lib/adapters/zedcor/contact-extractor.ts
//
// Sprint Z3.5 — Layer-1 (HTML/cheerio) extraction of GC contact info from
// a public bid/award detail page. The orchestrator in gc-extractor.ts
// calls this first; if a field is null it falls back to Anthropic Sonnet.
//
// Hard rule: never fabricate. If a field isn't literally on the page,
// return null. We do not normalize unknown phone formats to anything
// other than +1-XXX-XXX-XXXX (so US-only by design; international would
// need a separate path).

import * as cheerio from 'cheerio';

export interface ContactLayer1Result {
  gc_contact_name: string | null;
  gc_contact_role: string | null;
  gc_contact_email: string | null;
  gc_contact_phone: string | null;
}

// Generic mailboxes we want to *avoid* selecting as the contact email.
// They are not "the right person" — they're agency-wide inboxes.
const GENERIC_LOCAL_PARTS = new Set<string>([
  'info', 'support', 'help', 'admin', 'webmaster', 'postmaster',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'contact', 'hello', 'inquiries', 'inquiry',
]);

// Labels commonly preceding a contact block on award notices.
const CONTACT_LABEL_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(project\s+manager|pm\s*contact|subcontract(or)?\s+admin(istrator)?|estimator|bid\s+coordinator|contracts?\s+admin(istrator)?|point\s+of\s+contact|poc)\b/i,
  /\bcontact\s*(person|name|info|information)?\s*[:\-]/i,
];

const ROLE_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(project\s+manager|senior\s+project\s+manager|sr\.?\s+project\s+manager|assistant\s+project\s+manager|apm)\b/i,
  /\b(subcontract(or)?\s+admin(istrator)?|sub(contract)?\s+admin)\b/i,
  /\b(estimator|senior\s+estimator|chief\s+estimator)\b/i,
  /\b(bid\s+coordinator|preconstruction\s+manager|precon\s+manager)\b/i,
  /\b(contracts?\s+admin(istrator)?|contracts?\s+manager)\b/i,
];

function looksLikeGenericMailbox(email: string): boolean {
  const local = email.split('@', 1)[0]?.toLowerCase() ?? '';
  return GENERIC_LOCAL_PARTS.has(local);
}

/**
 * Normalize a phone string to +1-XXX-XXX-XXXX. Returns null if we
 * cannot confidently produce a 10-digit US number. We deliberately
 * reject leading-1 7-digit and any non-US looking pattern.
 */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '');
  let core: string;
  if (digits.length === 11 && digits.startsWith('1')) core = digits.slice(1);
  else if (digits.length === 10) core = digits;
  else return null;
  if (/^[01]/.test(core)) return null; // US area codes don't start with 0 or 1
  if (/^[01]/.test(core.slice(3, 6))) return null; // exchange likewise
  return `+1-${core.slice(0, 3)}-${core.slice(3, 6)}-${core.slice(6)}`;
}

/**
 * Find a "Name, Role" pair in a short text fragment. Used to identify
 * contact lines like "Jane Doe, Project Manager" without an Anthropic call.
 */
export function parseNameAndRole(fragment: string): { name: string | null; role: string | null } {
  const cleaned = fragment.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { name: null, role: null };

  // "Name, Role" or "Name - Role"
  const splitMatch = cleaned.match(/^([A-Z][a-zA-Z'’.\-]+(?:\s+[A-Z][a-zA-Z'’.\-]+){0,3})\s*[,\-–]\s*(.{3,80})$/);
  if (splitMatch) {
    const name = splitMatch[1].trim();
    const tail = splitMatch[2].trim();
    const roleMatch = ROLE_PATTERNS.map((re) => tail.match(re)).find(Boolean);
    return {
      name: name.split(' ').length >= 2 ? name : null,
      role: roleMatch ? roleMatch[0].trim() : null,
    };
  }

  // Just a name (two capitalized tokens) — accept, role=null.
  const nameOnly = cleaned.match(/^([A-Z][a-zA-Z'’.\-]+)\s+([A-Z][a-zA-Z'’.\-]+)(?:\s+([A-Z][a-zA-Z'’.\-]+))?$/);
  if (nameOnly) {
    return { name: nameOnly[0].trim(), role: null };
  }

  return { name: null, role: null };
}

/**
 * Layer-1 extraction. Scans the HTML for contact-block markers and pulls
 * the first non-generic match. Returns nulls liberally — the orchestrator
 * will retry via Anthropic when fields are missing.
 */
export function extractContactFromHtml(html: string): ContactLayer1Result {
  const $ = cheerio.load(html);

  // Strip scripts/styles so text scans are clean.
  $('script, style, noscript').remove();

  let bestEmail: string | null = null;
  let bestPhone: string | null = null;
  let bestName: string | null = null;
  let bestRole: string | null = null;

  // Pass 1: walk elements whose text contains a contact label, and look
  // for name / role / email / phone within that element + its siblings.
  $('*').each((_, el) => {
    const node = $(el);
    const text = node.text();
    if (!text || text.length > 400) return; // skip page-sized containers
    if (!CONTACT_LABEL_PATTERNS.some((re) => re.test(text))) return;

    const localScope = node.parent().text().slice(0, 800);

    if (!bestEmail) {
      const m = localScope.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
      if (m && !looksLikeGenericMailbox(m[0])) bestEmail = m[0];
    }
    if (!bestPhone) {
      const m = localScope.match(/(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
      if (m) bestPhone = normalizeUsPhone(m[0]);
    }
    if (!bestName || !bestRole) {
      const pr = parseNameAndRole(localScope);
      if (!bestName && pr.name) bestName = pr.name;
      if (!bestRole && pr.role) bestRole = pr.role;
    }
  });

  // Pass 2: mailto: links — accept the first non-generic.
  if (!bestEmail) {
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
      if (email && /@/.test(email) && !looksLikeGenericMailbox(email)) {
        bestEmail = email;
        return false;
      }
      return undefined;
    });
  }

  // Pass 3: tel: links — accept first parseable US number.
  if (!bestPhone) {
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const raw = href.replace(/^tel:/i, '').trim();
      const norm = normalizeUsPhone(raw);
      if (norm) {
        bestPhone = norm;
        return false;
      }
      return undefined;
    });
  }

  // Pass 4: if we have an email but no name, try the link text adjacent to it.
  if (bestEmail && !bestName) {
    $('a[href^="mailto:"]').each((_, el) => {
      const href = ($(el).attr('href') ?? '').toLowerCase();
      if (!href.includes(bestEmail!.toLowerCase())) return;
      const linkText = $(el).text().trim();
      const surrounding = $(el).parent().text().trim();
      const pr = parseNameAndRole(linkText) ;
      if (pr.name) {
        bestName = pr.name;
        if (!bestRole && pr.role) bestRole = pr.role;
        return false;
      }
      const pr2 = parseNameAndRole(surrounding);
      if (pr2.name) {
        bestName = pr2.name;
        if (!bestRole && pr2.role) bestRole = pr2.role;
        return false;
      }
      return undefined;
    });
  }

  return {
    gc_contact_name: bestName,
    gc_contact_role: bestRole,
    gc_contact_email: bestEmail,
    gc_contact_phone: bestPhone,
  };
}
