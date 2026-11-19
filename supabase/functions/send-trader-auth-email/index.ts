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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const emailFrom = Deno.env.get("RESEND_FROM_EMAIL") || "ManiPOS <reports@manipos.com>";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse({ error: "Email service not configured" }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const mode = body?.mode === "magic" ? "magic" : "signup";
  const redirectTo = String(body?.redirectTo || "https://manipos.com/?page=invoices");

  if (!email) return jsonResponse({ error: "Email is required" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const linkParams =
      mode === "signup"
        ? { type: "signup" as const, email, password, options: { redirectTo } }
        : { type: "magiclink" as const, email, options: { redirectTo } };

    const { data, error } = await admin.auth.admin.generateLink(linkParams);
    if (error) return jsonResponse({ error: error.message }, 400);

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      return jsonResponse({ error: "Could not generate verification link" }, 500);
    }

    const subject =
      mode === "signup"
        ? "Verify your ManiPOS Invoices account"
        : "Your ManiPOS Invoices sign-in link";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a; padding: 16px;">
        <h2 style="margin: 0 0 12px 0;">ManiPOS Invoices</h2>
        <p style="font-size: 14px; color: #334155; line-height: 1.5;">
          ${mode === "signup"
            ? "Click the button below to verify your email and open your ManiPOS Invoices account."
            : "Click the button below to sign in to your ManiPOS Invoices account."}
        </p>
        <p style="margin: 22px 0;">
          <a href="${actionLink}" style="background: #fbbf24; color: #0f172a; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;">
            ${mode === "signup" ? "Verify Email" : "Sign In"}
          </a>
        </p>
        <p style="font-size: 12px; color: #94a3b8;">ManiPOS · manipos.com</p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [email],
        subject,
        html,
      }),
    });
    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      return jsonResponse({ error: resendData?.message || "Failed to send email" }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err: any) {
    return jsonResponse({ error: err?.message || "Unexpected error" }, 500);
  }
});
