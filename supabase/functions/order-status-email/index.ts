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
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmed - Edmund Lungi's</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F8FB; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F6F8FB;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 24px rgba(11, 28, 45, 0.08);">
          <tr>
            <td style="padding: 40px 40px 24px 40px; text-align: center; border-bottom: 1px solid #E5E7EB;">
              <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 400; color: #0B1C2D; letter-spacing: 2px;">EDMUND LUNGI'S</h1>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #C9A24D; letter-spacing: 3px; text-transform: uppercase;">Premium South Indian Textiles</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 0 40px; text-align: center;">
              <span style="display: inline-block; padding: 8px 24px; background-color: #0B1C2D; color: #ffffff; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; border-radius: 20px;">Confirmed</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 16px 40px;">
              <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; color: #111111; font-weight: 400;">Dear ${escapeHtml(name)},</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #6B7280;">Thank you for choosing Edmund Lungi's. We are pleased to confirm that your order has been received and is being prepared with the utmost care.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F6F8FB; border-radius: 8px;">
                <tr>
                  <td style="padding: 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px;">Order ID</p>
                          <p style="margin: 4px 0 0 0; font-size: 16px; color: #111111; font-weight: 500;">${escapeHtml(orderId)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px;">Order Date</p>
                          <p style="margin: 4px 0 0 0; font-size: 16px; color: #111111; font-weight: 500;">${escapeHtml(createdAt)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px;">Total Amount</p>
                          <p style="margin: 4px 0 0 0; font-size: 20px; color: #0B1C2D; font-weight: 600;">${escapeHtml(total)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-left: 2px solid #C9A24D;">
                <tr>
                  <td style="padding-left: 20px;">
                    <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; font-style: italic; line-height: 1.7; color: #6B7280;">Each piece in your order has been crafted with the finest South Indian textiles, embodying generations of artisanal excellence and timeless elegance.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 0;">
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #6B7280;">Stay connected with Edmund Lungi's</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0 8px;">
                    <a href="https://www.facebook.com/share/1DmfPCWzYt/?mibextid=wwXIfr" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://www.instagram.com/edmund_lungi?igsh=MTE3YWd1bHNoZnc3cw%3D%3D&utm_source=qr" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733558.png" alt="Instagram" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://wa.me/916383329471" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-size: 13px; color: #111111;">Regards,<br><span style="color: #C9A24D;">Edmund Lungi's Support</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  if (args.emailType === "delivered") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Delivered - Edmund Lungi's</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F8FB; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F6F8FB;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 24px rgba(11, 28, 45, 0.08);">
          <tr>
            <td style="padding: 40px 40px 24px 40px; text-align: center; border-bottom: 1px solid #E5E7EB;">
              <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 400; color: #0B1C2D; letter-spacing: 2px;">EDMUND LUNGI'S</h1>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #C9A24D; letter-spacing: 3px; text-transform: uppercase;">Premium South Indian Textiles</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 0 40px; text-align: center;">
              <span style="display: inline-block; padding: 8px 24px; background-color: #C9A24D; color: #0B1C2D; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; border-radius: 20px;">Delivered</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 16px 40px;">
              <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; color: #111111; font-weight: 400;">Dear ${escapeHtml(name)},</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #6B7280;">We are delighted to inform you that your order has been successfully delivered. We hope it arrives in perfect condition and exceeds your expectations.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F6F8FB; border-radius: 8px;">
                <tr>
                  <td style="padding: 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px;">Order ID</p>
                          <p style="margin: 4px 0 0 0; font-size: 16px; color: #111111; font-weight: 500;">${escapeHtml(orderId)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px;">Delivery Date</p>
                          <p style="margin: 4px 0 0 0; font-size: 16px; color: #111111; font-weight: 500;">${escapeHtml(today)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-left: 2px solid #C9A24D;">
                <tr>
                  <td style="padding-left: 20px;">
                    <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; font-style: italic; line-height: 1.7; color: #6B7280;">May your new pieces bring you comfort and elegance. We invite you to explore our curated collections, where tradition meets contemporary sophistication.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 0;">
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #6B7280;">Stay connected with Edmund Lungi's</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0 8px;">
                    <a href="https://www.facebook.com/share/1DmfPCWzYt/?mibextid=wwXIfr" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://www.instagram.com/edmund_lungi?igsh=MTE3YWd1bHNoZnc3cw%3D%3D&utm_source=qr" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733558.png" alt="Instagram" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://wa.me/916383329471" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-size: 13px; color: #111111;">Regards,<br><span style="color: #C9A24D;">Edmund Lungi's Support</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Completed - Edmund Lungi's</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F8FB; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F6F8FB;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 24px rgba(11, 28, 45, 0.08);">
          <tr>
            <td style="padding: 40px 40px 24px 40px; text-align: center; border-bottom: 1px solid #E5E7EB;">
              <h1 style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 28px; font-weight: 400; color: #0B1C2D; letter-spacing: 2px;">EDMUND LUNGI'S</h1>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #C9A24D; letter-spacing: 3px; text-transform: uppercase;">Premium South Indian Textiles</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 0 40px; text-align: center;">
              <span style="display: inline-block; padding: 8px 24px; background-color: #10B981; color: #ffffff; font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; border-radius: 20px;">Completed</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px 16px 40px;">
              <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; color: #111111; font-weight: 400;">Dear ${escapeHtml(name)},</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #6B7280;">Your order has been successfully completed. We are truly grateful for your trust in Edmund Lungi's and hope you cherish your new pieces for years to come.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F6F8FB; border-radius: 8px;">
                <tr>
                  <td style="padding: 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px;">Order ID</p>
                          <p style="margin: 4px 0 0 0; font-size: 16px; color: #111111; font-weight: 500;">${escapeHtml(orderId)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <p style="margin: 0; font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px;">Total Paid</p>
                          <p style="margin: 4px 0 0 0; font-size: 20px; color: #0B1C2D; font-weight: 600;">${escapeHtml(total)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-left: 2px solid #C9A24D;">
                <tr>
                  <td style="padding-left: 20px;">
                    <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; font-style: italic; line-height: 1.7; color: #6B7280;">Your patronage means the world to us. As a valued member of the Edmund Lungi's family, we look forward to continuing to dress you in the finest traditions of South Indian craftsmanship.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 0;">
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 13px; color: #6B7280;">Stay connected with Edmund Lungi's</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0 8px;">
                    <a href="https://www.facebook.com/share/1DmfPCWzYt/?mibextid=wwXIfr" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://www.instagram.com/edmund_lungi?igsh=MTE3YWd1bHNoZnc3cw%3D%3D&utm_source=qr" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733558.png" alt="Instagram" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://wa.me/916383329471" style="text-decoration: none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" width="24" height="24" style="display: block; border: 0;">
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; font-size: 13px; color: #111111;">Regards,<br><span style="color: #C9A24D;">Edmund Lungi's Support</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
