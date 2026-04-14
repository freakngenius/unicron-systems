import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const { name, email } = await req.json();

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Save to Supabase
    const supabase = getSupabase();
    const { error: dbError } = await supabase
      .from("email_signups")
      .insert({ name, email });

    if (dbError) {
      if (dbError.code === "23505") {
        return NextResponse.json(
          { error: "This email is already signed up!" },
          { status: 409 }
        );
      }
      throw dbError;
    }

    // Save to Notion (if API key is configured)
    const notionKey = process.env.NOTION_API_KEY;
    const notionDbId = process.env.NOTION_DATABASE_ID;

    if (notionKey && notionDbId) {
      await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          parent: { database_id: notionDbId },
          properties: {
            Name: { title: [{ text: { content: name } }] },
            Email: { email },
          },
        }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
