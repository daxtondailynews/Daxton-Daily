// Supabase Edge Function: receives Stripe webhook events and keeps
// public.memberships in sync with each member's subscription status
// (new, renewed, payment failed, cancelled). This is the only thing that
// ever writes a Stripe-driven membership status.
//
// Must be deployed with "Verify JWT" turned OFF — Stripe calls it
// directly, and it authenticates Stripe by the webhook signature instead.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY      Stripe -> Developers -> API keys -> Secret key
//   STRIPE_WEBHOOK_SECRET  the endpoint's signing secret (whsec_...)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(),
});
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (err) {
    console.error("stripe-webhook: bad signature:", err instanceof Error ? err.message : err);
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(subId, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription((event.data.object as Stripe.Subscription).id, null);
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry the event later.
    console.error("stripe-webhook: failed handling " + event.type + ":", err instanceof Error ? err.message : err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// Always re-fetches the subscription from Stripe, so events arriving out of
// order can't leave a stale status behind.
async function syncSubscription(subscriptionId: string, userIdHint: string | null) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  let userId: string | null = userIdHint || sub.metadata?.user_id || null;
  if (!userId) {
    const { data } = await admin
      .from("memberships")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = data?.user_id ?? null;
  }
  if (!userId) {
    console.warn("stripe-webhook: no account found for customer " + customerId + " — ignoring.");
    return;
  }

  // Newer Stripe API versions report the billing period per item.
  // deno-lint-ignore no-explicit-any
  const anySub = sub as any;
  const periodEnd: number | undefined = anySub.current_period_end ?? anySub.items?.data?.[0]?.current_period_end;

  const { error } = await admin.from("memberships").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("couldn't save membership: " + error.message);
  console.log("stripe-webhook: " + userId + " is now " + sub.status + ".");
}
