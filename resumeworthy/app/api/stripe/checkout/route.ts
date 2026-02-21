import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: Request) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripePriceId = process.env.STRIPE_PRICE_ID;

    if (!stripeSecretKey || !stripePriceId) {
      return NextResponse.json(
        { error: "Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID." },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId : "";

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      client_reference_id: userId || undefined,
      metadata: userId ? { userId } : undefined,
    });

    return NextResponse.json({ id: session.id, url: session.url });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to create Stripe checkout session." }, { status: 500 });
  }
}
