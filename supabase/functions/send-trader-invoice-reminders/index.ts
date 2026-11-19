import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendResendEmail({
  apiKey,
  from,
  to,
  subject,
  html,
}: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Resend error (${res.status})`);
  }
  return data;
}

function buildEmailHtml(inv: Record<string, any>, profile: Record<string, any>, mode: string) {
  const currency = profile?.currency || "KES";
  const total = Number(inv.total_amount || 0);
  const paid = Number(inv.amount_paid || 0);
  const balance = Math.max(0, total - paid);
  const publicUrl = `https://manipos.com/#/inv/${inv.public_token}`;
  const businessName = profile?.business_name || "Your Supplier";

  const heading =
    mode === "receipt"
      ? `Payment Receipt from ${businessName}`
      : mode === "reminder"
      ? `Friendly Payment Reminder — ${inv.invoice_number}`
      : `Invoice ${inv.invoice_number} from ${businessName}`;

  const paymentBits = [
    profile?.mpesa_till_no ? `<li><strong>M-Pesa Till No:</strong> ${profile.mpesa_till_no}</li>` : "",
    profile?.mpesa_paybill_no
      ? `<li><strong>M-Pesa Paybill:</strong> ${profile.mpesa_paybill_no}${profile.mpesa_account_no ? ` (Account: ${profile.mpesa_account_no})` : ""}</li>`
      : "",
    profile?.send_money_number
      ? `<li><strong>Send Money (${profile.send_money_provider || "M-Pesa"}):</strong> ${profile.send_money_number}</li>`
      : "",
    profile?.accepts_cash !== false ? `<li><strong>Cash</strong> or <strong>Cheque</strong></li>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
      <h2 style="margin-bottom: 4px;">${heading}</h2>
      <p style="color: #475569; font-size: 14px;">Hello ${inv.buyer_name || "Customer"},</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Document:</strong> ${inv.invoice_number}</p>
        <p style="margin: 4px 0;"><strong>Total Amount:</strong> ${currency} ${total.toLocaleString()}</p>
        ${mode === "receipt"
          ? `<p style="margin: 4px 0; color: #059669;"><strong>Status:</strong> PAID (${inv.payment_method || "Settled"})</p>`
          : `<p style="margin: 4px 0; color: #b45309;"><strong>Balance Due:</strong> ${currency} ${balance.toLocaleString()}</p>
             ${inv.due_date ? `<p style="margin: 4px 0;"><strong>Due Date:</strong> ${inv.due_date}</p>` : ""}`}
      </div>
      ${paymentBits && mode !== "receipt" ? `<p style="font-size: 13px; margin-bottom: 6px;"><strong>Payment Options:</strong></p><ul style="font-size: 13px; color: #334155;">${paymentBits}</ul>` : ""}
      <p style="margin: 20px 0;">
        <a href="${publicUrl}" style="background: #fbbf24; color: #0f172a; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;">
          View &amp; Download PDF
        </a>
      </p>
      <p style="font-size: 12px; color: #94a3b8;">Sent via ManiPOS Invoices · manipos.com/#/invoices</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const emailFrom = Deno.env.get("RESEND_FROM_EMAIL") || "ManiPOS Invoices <reports@manipos.com>";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase service role configuration" }, 500);
  }
  if (!resendApiKey) {
    return jsonResponse({ error: "RESEND_API_KEY not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const body = await req.json().catch(() => ({}));

  // 1. On-demand single invoice / reminder / receipt email
  if (body?.invoiceId) {
    const mode = body.mode || "invoice";
    const { data: inv, error: invErr } = await admin
      .from("trader_invoices")
      .select("*")
      .eq("id", body.invoiceId)
      .maybeSingle();

    if (invErr || !inv) return jsonResponse({ error: "Invoice not found" }, 404);
    if (!inv.buyer_email) return jsonResponse({ error: "Buyer email is missing on this invoice" }, 400);

    const { data: profile } = await admin
      .from("trader_profiles")
      .select("*")
      .eq("id", inv.trader_id)
      .maybeSingle();

    const subject =
      mode === "receipt"
        ? `Payment Receipt ${inv.invoice_number} from ${profile?.business_name || "Supplier"}`
        : mode === "reminder"
        ? `Reminder: Invoice ${inv.invoice_number} (${profile?.currency || "KES"} ${Number(inv.total_amount || 0).toLocaleString()})`
        : `Invoice ${inv.invoice_number} from ${profile?.business_name || "Supplier"}`;

    await sendResendEmail({
      apiKey: resendApiKey,
      from: emailFrom,
      to: inv.buyer_email,
      subject,
      html: buildEmailHtml(inv, profile || {}, mode),
    });

    if (mode === "reminder") {
      await admin
        .from("trader_invoices")
        .update({
          last_reminded_at: new Date().toISOString(),
          reminder_count: Number(inv.reminder_count || 0) + 1,
        })
        .eq("id", inv.id);
    }

    return jsonResponse({ ok: true, sentTo: inv.buyer_email, mode });
  }

  // 2. Scheduled daily cron: follow up on pending/partial/overdue invoices
  const { data: pendingList, error: listErr } = await admin
    .from("trader_invoices")
    .select("*")
    .in("status", ["pending", "partial", "overdue"])
    .eq("auto_remind", true)
    .not("buyer_email", "is", null)
    .not("due_date", "is", null);

  if (listErr) return jsonResponse({ error: listErr.message }, 500);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  let sentCount = 0;

  for (const inv of pendingList || []) {
    if (!inv.buyer_email || !inv.due_date) continue;
    const dueMs = new Date(`${inv.due_date}T00:00:00Z`).getTime();
    const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();
    const diffDays = Math.round((todayMs - dueMs) / (24 * 60 * 60 * 1000));

    // Mark overdue if past due date
    if (diffDays > 0 && inv.status !== "overdue") {
      await admin.from("trader_invoices").update({ status: "overdue" }).eq("id", inv.id);
    }

    // Remind 2 days before due date (-2), on due date (0), and every 3 days overdue (> 0 && % 3 === 0)
    const shouldRemindToday = diffDays === -2 || diffDays === 0 || (diffDays > 0 && diffDays % 3 === 0);
    if (!shouldRemindToday) continue;

    // Avoid duplicate send on the same day
    if (inv.last_reminded_at && String(inv.last_reminded_at).slice(0, 10) === todayStr) continue;

    const { data: profile } = await admin
      .from("trader_profiles")
      .select("*")
      .eq("id", inv.trader_id)
      .maybeSingle();

    try {
      await sendResendEmail({
        apiKey: resendApiKey,
        from: emailFrom,
        to: inv.buyer_email,
        subject: `Reminder: Invoice ${inv.invoice_number} from ${profile?.business_name || "Supplier"}`,
        html: buildEmailHtml(inv, profile || {}, "reminder"),
      });
      await admin
        .from("trader_invoices")
        .update({
          last_reminded_at: new Date().toISOString(),
          reminder_count: Number(inv.reminder_count || 0) + 1,
        })
        .eq("id", inv.id);
      sentCount += 1;
    } catch (e) {
      console.warn("Trader reminder send failed:", inv.id, e);
    }
  }

  return jsonResponse({ ok: true, sentCount });
});
