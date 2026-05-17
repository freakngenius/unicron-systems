import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export const dynamic = "force-dynamic";

/**
 * Signup payload from the v8 landing form. Five required fields:
 *   - companyName, role, firstName, lastName, email
 *
 * Supabase `email_signups` is the dedupe source-of-truth (unique on email).
 * Notion is the readable surface for the team — schema:
 *   Company Name (title), Role (text), First Name (text), Last Name (text),
 *   Email Address (email).
 *
 * Notion DB id is supplied via NOTION_DATABASE_ID. The v8 cutover target is
 * 08e5bc8cd90c487cbca0d450f3a32773 — set in Vercel env at merge time.
 */
type SignupBody = {
  companyName?: unknown;
  role?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
};

function asTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length === 0 ? null : s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let parsed: SignupBody;
  try {
    parsed = (await req.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const companyName = asTrimmedString(parsed.companyName);
  const role = asTrimmedString(parsed.role);
  const firstName = asTrimmedString(parsed.firstName);
  const lastName = asTrimmedString(parsed.lastName);
  const email = asTrimmedString(parsed.email)?.toLowerCase() ?? null;

  if (!companyName || !role || !firstName || !lastName || !email) {
    return NextResponse.json(
      { error: "All fields are required: company name, role, first name, last name, email." },
      { status: 400 },
    );
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  // 1) Supabase insert — dedupe gate. `name` left NULL (legacy column).
  try {
    const supabase = getSupabase();
    const { error: dbError } = await supabase.from("email_signups").insert({
      email,
      first_name: firstName,
      last_name: lastName,
      role,
      company: companyName,
    });

    if (dbError) {
      if (dbError.code === "23505") {
        return NextResponse.json(
          { error: "This email is already on the list." },
          { status: 409 },
        );
      }
      console.error("Signup Supabase error:", dbError);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("Signup Supabase exception:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  // 2) Notion mirror — best-effort. We do NOT fail the request if Notion is
  //    misconfigured / rate-limited; Supabase already has the durable record.
  //    Errors are logged so they show up in Vercel logs for manual backfill.
  const notionKey = process.env.NOTION_API_KEY;
  const notionDbId = process.env.NOTION_DATABASE_ID;
  if (notionKey && notionDbId) {
    try {
      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          parent: { database_id: notionDbId },
          properties: {
            "Company Name": { title: [{ text: { content: companyName } }] },
            Role: { rich_text: [{ text: { content: role } }] },
            "First Name": { rich_text: [{ text: { content: firstName } }] },
            "Last Name": { rich_text: [{ text: { content: lastName } }] },
            "Email Address": { email },
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Signup Notion mirror failed:", res.status, text);
      }
    } catch (err) {
      console.error("Signup Notion mirror exception:", err);
    }
  }

  return NextResponse.json({ success: true });
}
