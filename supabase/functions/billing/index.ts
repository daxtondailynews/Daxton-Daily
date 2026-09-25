// Supabase Edge Function: starts Stripe Checkout for the $5/month
// membership, or opens the Stripe customer portal (update card, cancel)
// for someone who's already a member. Called from the browser by
// NewsAuth.startCheckout() / openBillingPortal() in js/auth.js.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY   Stripe -> Developers -> API keys -> Secret key
//   STRIPE_PRICE_ID     the $5/month price's ID (price_...)
//   SITE_URL            optional, defaults to https://daxtondaily.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
});
const PRICE_ID = Deno.env.get("STRIPE_PRICE_ID") ?? "";
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://daxtondaily.com").replace(/\/+$/, "");
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const MEMBER_STATUSES = ["active", "trialing", "comped"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user) return json({ error: "Please log in first." }, 401);

    const { action } = await req.json().catch(() => ({ action: null }));

    const { data: membership } = await admin
      .from("memberships")
      .select("stripe_customer_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId: string | null = membership?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      const { error } = await admin
        .from("memberships")
        .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() });
      if (error) throw new Error("couldn't save Stripe customer: " + error.message);
    }

    const isMember = !!membership && MEMBER_STATUSES.includes(membership.status);

    // Members always go to the portal, so nobody can end up paying twice.
    if (action === "portal" || (action === "checkout" && isMember)) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: SITE_URL + "/index.html",
      });
      return json({ url: portal.url });
    }

    if (action === "checkout") {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        // Shows the "Add promotion code" box — where friends & family
        // enter the free-membership code.
        allow_promotion_codes: true,
        // With a 100%-off code the total is $0, so don't ask for a card.
        payment_method_collection: "if_required",
        subscription_data: { metadata: { user_id: user.id } },
        success_url: SITE_URL + "/index.html?membership=success",
        cancel_url: SITE_URL + "/index.html?membership=cancelled",
      });
      return json({ url: session.url });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("billing:", message);
    // Stripe's own error text (e.g. "No such price") is safe to show and
    // makes setup problems obvious.
    const isStripeError = !!(err && typeof err === "object" && "type" in err && String((err as { type: unknown }).type).startsWith("Stripe"));
    return json({
      error: isStripeError
        ? "Payment setup problem: " + message
        : "Something went wrong reaching the payment page. Please try again.",
    }, 500);
  }
});
