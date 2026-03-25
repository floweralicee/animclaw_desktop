import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
        ...(process.env.STRIPE_METERED_PRICE_ID
          ? [{ price: process.env.STRIPE_METERED_PRICE_ID }]
          : []),
      ],
      success_url: `${process.env.NEXTAUTH_URL ?? "http://localhost:3100"}/checkout/complete?status=success`,
      cancel_url: `${process.env.NEXTAUTH_URL ?? "http://localhost:3100"}/checkout/complete?status=cancelled`,
      metadata: {
        userId: session.user.id,
      },
      client_reference_id: session.user.id,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
