import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { stripe } from "@/lib/stripe";
import {
  ONE_TIME_PRICE_CENTS,
  SUBSCRIPTION_PRICE_CENTS_PER_MONTH,
  FEATURE_TIER_LABELS,
} from "@/lib/licensing/pricing";

// Billing is deliberately ADMIN-only, hardcoded - not part of the
// configurable permission system (src/lib/permissions). Who can spend the
// business's money is a tenant-ownership question, not something an ADMIN
// should be able to delegate to a MANAGER via the User Manager page.
const checkoutSchema = z.object({
  billingPlan: z.enum(["ONE_TIME", "SUBSCRIPTION"]),
  // Which module(s) to buy - independent of whatever tier the tenant is
  // currently exploring for free. Lets a tenant buy just shift management or
  // just appointment management, not only whatever they originally picked.
  tier: z.enum(["SHIFT_MANAGEMENT", "APPOINTMENT_MANAGER", "BOTH"]),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    if (!session.tenantId) throw new Error("FORBIDDEN");

    const json = await request.json().catch(() => null);
    const parsed = checkoutSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { billingPlan, tier } = parsed.data;

    const tenant = await runInTenantContext(session.tenantId, session.userId, "ADMIN", (tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: session.tenantId! } })
    );

    const origin = request.nextUrl.origin;
    const returnBase = `${origin}/app/${tenant.slug}/billing`;
    const productName = `ShiftUp - ${FEATURE_TIER_LABELS[tier]}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: billingPlan === "ONE_TIME" ? "payment" : "subscription",
      // PayPal is a built-in Stripe Checkout payment method - no separate
      // integration needed, but it still has to be turned on in the Stripe
      // Dashboard (Settings > Payment methods) before it actually appears;
      // this is just a filter on top of whatever's enabled there, not a
      // force-enable. Only allowed for one-time purchases for now - Stripe's
      // PayPal-for-subscriptions support needs verifying against a live
      // account before turning it on there too (see TODO.md). Omitted
      // entirely for subscriptions so Stripe's normal auto-detected set applies.
      ...(billingPlan === "ONE_TIME"
        ? { allowed_payment_method_types: ["card", "paypal"] as const }
        : {}),
      client_reference_id: tenant.id,
      customer_email: undefined,
      metadata: { tenantId: tenant.id, billingPlan, tier },
      success_url: `${returnBase}?checkout=success`,
      cancel_url: `${returnBase}?checkout=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount:
              billingPlan === "ONE_TIME"
                ? ONE_TIME_PRICE_CENTS[tier]
                : SUBSCRIPTION_PRICE_CENTS_PER_MONTH[tier],
            product_data: { name: productName },
            ...(billingPlan === "SUBSCRIPTION"
              ? { recurring: { interval: "month" as const } }
              : {}),
          },
        },
      ],
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to create checkout session", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
