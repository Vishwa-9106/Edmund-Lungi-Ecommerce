import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import nodemailer from "npm:nodemailer@6.9.13";

type TriggerStatus = "Confirmed" | "Delivered" | "Completed";

type EmailType = "confirmed" | "delivered" | "completed";

type Payload = {
  order_id: string;
  new_status: string;
};

const STATUS_TO_EMAIL: Record<TriggerStatus, { emailType: EmailType; subject: string }> = {
  Confirmed: {
    emailType: "confirmed",
    subject: "Your Order Has Been Confirmed – Edmund Lungi’s",
  },
  Delivered: {
    emailType: "delivered",
    subject: "Your Order Has Been Delivered – Edmund Lungi’s",
  },
  Completed: {
    emailType: "completed",
    subject: "Order Completed – Thank You for Shopping with Edmund Lungi’s",
  },
};

function normalizeStatus(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim();
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

function money(total: number | string | null, currency: string | null) {
  const n = typeof total === "string" ? Number(total) : total;
  if (typeof n !== "number" || Number.isNaN(n)) return "-";
  const v = n.toFixed(2);
  return currency ? `${v} ${currency}` : v;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmailHtml(args: {
  emailType: EmailType;
  userName: string;
  orderNumber: string;
  orderCreatedAt: string;
  total: number | string | null;
  currency: string | null;
}) {
  const name = args.userName.trim() || "Customer";
  const orderId = args.orderNumber || "-";
  const createdAt = formatDate(args.orderCreatedAt);
  const total = money(args.total, args.currency);
  const today = formatDate(new Date().toISOString());

  if (args.emailType === "confirmed") {
    return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your order <strong>${escapeHtml(orderId)}</strong> placed on <strong>${escapeHtml(createdAt)}</strong> has been <strong>confirmed</strong>.</p>
  <p>Total amount: <strong>${escapeHtml(total)}</strong></p>
  <p>We’re now preparing your order and will update you once it moves to the next stage.</p>
  <p>Thank you for shopping with Edmund Lungi’s.</p>
  <p style="margin-top:24px;">Regards,<br/>Edmund Lungi’s Support</p>
</body></html>`;
  }

  if (args.emailType === "delivered") {
    return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Good news—your order <strong>${escapeHtml(orderId)}</strong> has been <strong>delivered</strong> on <strong>${escapeHtml(today)}</strong>.</p>
  <p>Thank you for choosing Edmund Lungi’s. We hope you love your purchase.</p>
  <p style="margin-top:24px;">Regards,<br/>Edmund Lungi’s Support</p>
</body></html>`;
  }

  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111;">
  <p>Hi ${escapeHtml(name)},</p>
  <p>Your order <strong>${escapeHtml(orderId)}</strong> is now marked as <strong>completed</strong>.</p>
  <p>Total paid: <strong>${escapeHtml(total)}</strong></p>
  <p>We’d love to see you again. If you have any feedback, simply reply to this email.</p>
  <p style="margin-top:24px;">Regards,<br/>Edmund Lungi’s Support</p>
</body></html>`;
}

async function sendViaSmtp(args: { to: string; subject: string; html: string }) {
  const host = Deno.env.get("SMTP_HOST")?.trim();
  const portRaw = Deno.env.get("SMTP_PORT")?.trim();
  const secureRaw = Deno.env.get("SMTP_SECURE")?.trim();
  const user = Deno.env.get("SMTP_USER")?.trim();
  const pass = Deno.env.get("SMTP_PASS")?.trim();
  const fromName = Deno.env.get("FROM_NAME")?.trim() || "Edmund Lungi’s";
  const fromEmail = Deno.env.get("FROM_EMAIL")?.trim();

  const port = portRaw ? Number(portRaw) : NaN;
  const secure = (secureRaw || "").toLowerCase() === "true";

  console.log({
    SMTP_HOST: host || null,
    SMTP_PORT: portRaw || null,
    SMTP_USER: user || null,
    SMTP_PASS_PRESENT: !!pass,
    SMTP_SECURE: secureRaw || null,
    FROM_EMAIL: fromEmail || null,
  });

  if (!host) return { ok: false as const, error: "Missing SMTP_HOST" };
  if (!Number.isFinite(port)) return { ok: false as const, error: "Invalid SMTP_PORT" };
  if (!user) return { ok: false as const, error: "Missing SMTP_USER" };
  if (!pass) return { ok: false as const, error: "Missing SMTP_PASS" };
  if (!fromEmail) return { ok: false as const, error: "Missing FROM_EMAIL" };

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const from = `${fromName} <${fromEmail}>`;

    await transporter.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    });

    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SMTP send failed";
    return { ok: false as const, error: msg };
  }
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
    const orderId = String(payload?.order_id ?? "").trim();
    const newStatus = normalizeStatus(String(payload?.new_status ?? ""));

    if (!orderId) {
      return new Response(JSON.stringify({ error: "order_id is required" }), {
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

    const { data: orderRow, error: orderErr } = await supabaseService
      .from("orders")
      .select("id, user_id, order_number, status, total, currency, created_at")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !orderRow) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const oldStatus = normalizeStatus((orderRow as any).status);

    if (oldStatus === newStatus) {
      return new Response(JSON.stringify({ ok: true, updated: false, emailed: false, reason: "status_unchanged" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { error: updateErr } = await supabaseService
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message || "Failed to update order" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const trigger = (STATUS_TO_EMAIL as any)[newStatus] as { emailType: EmailType; subject: string } | undefined;
    if (!trigger) {
      return new Response(JSON.stringify({ ok: true, updated: true, emailed: false, reason: "status_not_eligible" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const orderUserId = String((orderRow as any).user_id || "").trim();

    const { data: userProfile } = await supabaseService
      .from("users")
      .select("id, name, email")
      .eq("id", orderUserId)
      .maybeSingle();

    const userName = String((userProfile as any)?.name ?? "").trim();
    let userEmail = String((userProfile as any)?.email ?? "").trim();

    if (!userEmail) {
      const { data: authUser } = await supabaseService.auth.admin.getUserById(orderUserId);
      userEmail = String(authUser?.user?.email ?? "").trim();
    }

    if (!userEmail) {
      await supabaseService.from("email_logs").insert({
        order_id: orderId,
        user_email: null,
        email_type: trigger.emailType,
        status: "failed",
        error_message: "User email missing",
      });

      return new Response(JSON.stringify({ ok: true, updated: true, emailed: false, reason: "missing_email" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: existingSuccess } = await supabaseService
      .from("email_logs")
      .select("id")
      .eq("order_id", orderId)
      .eq("email_type", trigger.emailType)
      .eq("status", "success")
      .maybeSingle();

    if (existingSuccess?.id) {
      return new Response(JSON.stringify({ ok: true, updated: true, emailed: false, reason: "already_emailed" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const html = buildEmailHtml({
      emailType: trigger.emailType,
      userName,
      orderNumber: String((orderRow as any).order_number ?? (orderRow as any).id ?? ""),
      orderCreatedAt: String((orderRow as any).created_at ?? new Date().toISOString()),
      total: (orderRow as any).total ?? null,
      currency: (orderRow as any).currency ?? null,
    });

    const sendRes = await sendViaSmtp({ to: userEmail, subject: trigger.subject, html });

    if (sendRes.ok) {
      await supabaseService.from("email_logs").insert({
        order_id: orderId,
        user_email: userEmail,
        email_type: trigger.emailType,
        status: "success",
      });

      return new Response(JSON.stringify({ ok: true, updated: true, emailed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    await supabaseService.from("email_logs").insert({
      order_id: orderId,
      user_email: userEmail,
      email_type: trigger.emailType,
      status: "failed",
      error_message: sendRes.error,
    });

    return new Response(JSON.stringify({ ok: true, updated: true, emailed: false, reason: "send_failed" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
