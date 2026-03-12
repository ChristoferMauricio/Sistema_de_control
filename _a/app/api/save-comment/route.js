import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request) {
  try {
    const { jira_key, comentario } = await request.json();

    if (!jira_key) {
      return NextResponse.json({ error: "jira_key es requerido" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("jira_tickets")
      .update({ comentario: comentario || "" })
      .eq("jira_key", jira_key)
      .select("jira_key, comentario")
      .single();

    if (error) {
      console.error("Error updating comentario:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("save-comment API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
