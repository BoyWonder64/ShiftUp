import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { runInSystemContext } from "@/lib/tenant-context";

/**
 * Stripe calls this directly (no session/cookie) - trust comes from the
 * signature check below, not from auth middleware. Runs in system context
 * because the tenant to update is identified by metadata Stripe echoes back,
 * not by who's logged in (nobody is, from this request's point of view).
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    console.error("Stripe webhook called without a signature or STRIPE_WEBHOOK_SECRET configured");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const tenantId = checkoutSession.metadata?.tenantId ?? checkoutSession.client_reference_id;
        if (!tenantId) {
          console.error("checkout.session.completed with no tenantId in metadata");
          break;
        }
        const tier = checkoutSession.metadata?.tier as
          | "SHIFT_MANAGEMENT"
          | "APPOINTMENT_MANAGER"
          | "BOTH"
          | undefined;
        if (!tier) {
          console.error("checkout.session.completed with no tier in metadata");
          break;
        }

        await runInSystemContext(async (tx) => {
          if (checkoutSession.mode === "payment") {
            await tx.license.update({
              where: { tenantId },
              data: {
                tier,
                billingPlan: "ONE_TIME",
                status: "ACTIVE",
                purchasedAt: new Date(),
                expiresAt: null,
                stripeCustomerId:
                  typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
                stripePaymentIntentId:
                  typeof checkoutSession.payment_intent === "string"
                    ? checkoutSession.payment_intent
                    : null,
              },
            });
          } else if (checkoutSession.mode === "subscription") {
            const subscriptionId =
              typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null;
            let expiresAt: Date | null = null;
            if (subscriptionId) {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              const periodEnd = subscription.items.data[0]?.current_period_end;
              expiresAt = periodEnd ? new Date(periodEnd * 1000) : null;
            }
            await tx.license.update({
              where: { tenantId },
              data: {
                tier,
                billingPlan: "SUBSCRIPTION",
                status: "ACTIVE",
                purchasedAt: new Date(),
                expiresAt,
                stripeCustomerId:
                  typeof checkoutSession.customer === "string" ? checkoutSession.customer : null,
                stripeSubscriptionId: subscriptionId,
              },
            });
          }
        });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const periodEnd = subscription.items.data[0]?.current_period_end;
        await runInSystemContext(async (tx) => {
          const license = await tx.license.findFirst({
            where: { stripeSubscriptionId: subscription.id },
          });
          if (!license) return;
          await tx.license.update({
            where: { id: license.id },
            data: {
              status: subscription.status === "active" ? "ACTIVE" : "EXPIRED",
              expiresAt: periodEnd ? new Date(periodEnd * 1000) : null,
            },
          });
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await runInSystemContext(async (tx) => {
          const license = await tx.license.findFirst({
            where: { stripeSubscriptionId: subscription.id },
          });
          if (!license) return;
          await tx.license.update({
            where: { id: license.id },
            data: { status: "EXPIRED" },
          });
        });
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Error handling Stripe webhook", event.type, err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}
