import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey);
}

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 500 });
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
    }

    const stripe = new Stripe(stripeSecretKey);
    const payload = await request.text();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId;

      if (userId && typeof session.subscription === "string") {
        const subscriptionResponse = await stripe.subscriptions.retrieve(session.subscription);
        const subscription = subscriptionResponse as unknown as Stripe.Subscription;
        const currentPeriodEndUnix = (subscription as any).current_period_end;
        const supabaseAdmin = getSupabaseAdminClient();

        const { error } = await supabaseAdmin
          .from("user_plans")
          .upsert(
            {
              user_id: userId,
              status: subscription.status,
              stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : null,
              stripe_subscription_id: subscription.id,
              current_period_end:
                typeof currentPeriodEndUnix === "number"
                  ? new Date(currentPeriodEndUnix * 1000).toISOString()
                  : null,
            },
            { onConflict: "user_id" }
          );

        if (error) {
          return NextResponse.json({ error: `Failed to persist plan: ${error.message}` }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Stripe webhook failed." }, { status: 400 });
  }
}
