/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

type Audience = "all" | "ordered" | "single";

type Payload = {
  subject: string;
  body: string;
  audience: Audience;
  single_email?: string;
};

type SendResult = { ok: true } | { ok: false; error: string };

async function sendViaSmtp(args: { to: string; subject: string; html: string }): Promise<SendResult> {
  const host = Deno.env.get("SMTP_HOST")?.trim();
  const port = Number(Deno.env.get("SMTP_PORT") || "0");
  const secure = (Deno.env.get("SMTP_SECURE") || "false").toLowerCase() === "true";
  const user = Deno.env.get("SMTP_USER")?.trim();
  const pass = Deno.env.get("SMTP_PASS")?.trim();
  const fromName = Deno.env.get("FROM_NAME")?.trim() || "";
  const fromEmail = Deno.env.get("FROM_EMAIL")?.trim() || user || "";

  if (!host || !port || !user || !pass || !fromEmail) {
    return { ok: false, error: "SMTP not configured" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      to: args.to,
      subject: args.subject,
      html: args.html,
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SMTP send failed";
    return { ok: false, error: msg };
  }
}

function normalizeEmail(raw: unknown) {
  return String(raw ?? "").trim().toLowerCase();
}

async function isUserEmail(supabaseService: ReturnType<typeof createClient>, email: string) {
  const clean = normalizeEmail(email);
  if (!clean) return false;

  const { data } = await supabaseService
    .from("users")
    .select("id, role")
    .eq("email", clean)
    .maybeSingle();

  const role = String((data as any)?.role ?? "").trim().toLowerCase();
  return role === "user";
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "*";
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  if (!url || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: "Supabase env not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";

  const supabaseAuth = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseService = createClient(url, serviceKey);

  try {
    const payload = (await req.json()) as Payload;
    const subject = String(payload?.subject ?? "").trim();
    const body = String(payload?.body ?? "").trim();
    const audience = (String(payload?.audience ?? "") as Audience).trim() as Audience;
    const singleEmail = normalizeEmail(payload?.single_email);

    if (!subject) {
      return new Response(JSON.stringify({ error: "Subject is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!body) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!audience || !["all", "ordered", "single"].includes(audience)) {
      return new Response(JSON.stringify({ error: "Audience is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (audience === "single" && !singleEmail) {
      return new Response(JSON.stringify({ error: "Email is required for single user" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: authData, error: authErr } = await supabaseAuth.auth.getUser();
    if (authErr || !authData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const requesterId = authData.user.id;

    const { data: adminRow } = await supabaseService
      .from("users")
      .select("id, role")
      .eq("id", requesterId)
      .maybeSingle();

    if ((adminRow as any)?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: campaignRow, error: campaignErr } = await supabaseService
      .from("email_campaigns")
      .insert({ subject, body, audience, status: "draft", sent_count: 0 })
      .select("id")
      .single();

    if (campaignErr || !campaignRow?.id) {
      return new Response(JSON.stringify({ error: campaignErr?.message || "Failed to create campaign" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const campaignId = String((campaignRow as any).id);

    const recipients: string[] = [];

    if (audience === "single") {
      // Mandatory safety rule: only send if role === 'user'.
      if (await isUserEmail(supabaseService, singleEmail)) {
        recipients.push(singleEmail);
      }
    } else if (audience === "all") {
      const { data, error } = await supabaseService
        .from("users")
        .select("email")
        .eq("role", "user")
        .limit(500);

      if (error) throw error;

      for (const row of Array.isArray(data) ? (data as any[]) : []) {
        const email = normalizeEmail(row?.email);
        if (!email) continue;
        recipients.push(email);
        if (recipients.length >= 500) break;
      }
    } else if (audience === "ordered") {
      const { data, error } = await supabaseService
        .from("orders")
        .select("user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;

      const seen = new Set<string>();
      const ids: string[] = [];
      for (const row of Array.isArray(data) ? (data as any[]) : []) {
        const id = String(row?.user_id || "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= 500) break;
      }

      if (ids.length > 0) {
        const { data: profileRows } = await supabaseService
          .from("users")
          .select("id, email, role")
          .in("id", ids);

        const emailById = new Map<string, string>();
        for (const r of Array.isArray(profileRows) ? (profileRows as any[]) : []) {
          const id = String(r?.id || "").trim();
          const email = normalizeEmail(r?.email);
          const role = String(r?.role || "").trim().toLowerCase();
          if (id && email && role === "user") emailById.set(id, email);
        }

        for (const id of ids) {
          const email = emailById.get(id);
          if (email) recipients.push(email);
          if (recipients.length >= 500) break;
        }
      }
    }

    const uniqueRecipients = Array.from(new Set(recipients)).slice(0, 500);

    // Mandatory safety net: only send when role === 'user'.
    const safeRecipients: string[] = [];
    for (const to of uniqueRecipients) {
      if (!(await isUserEmail(supabaseService, to))) continue;
      safeRecipients.push(to);
      if (safeRecipients.length >= 500) break;
    }

    const results: Array<{ email: string; ok: boolean }> = [];

    for (const to of safeRecipients) {
      const sendRes = await sendViaSmtp({ to, subject, html: body });
      results.push({ email: to, ok: sendRes.ok });

      await supabaseService.from("email_campaign_logs").insert({
        campaign_id: campaignId,
        user_email: to,
        status: sendRes.ok ? "sent" : "failed",
      });
    }

    const sentCount = results.filter((r) => r.ok).length;

    await supabaseService
      .from("email_campaigns")
      .update({ status: "sent", sent_count: sentCount, sent_at: new Date().toISOString() })
      .eq("id", campaignId);

    return new Response(
      JSON.stringify({ ok: true, campaign_id: campaignId, sent_count: sentCount, total: safeRecipients.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
