import "server-only";
import Stripe from "stripe";

/**
 * Platform-level Stripe account - collects the tenant's one-time/subscription
 * license payment. Distinct from the (not-yet-built) Stripe Connect flow for
 * client-pays-business-for-appointment, which will use each tenant's own
 * connected account instead of this one. See architecture plan section 6.
 *
 * Lazily constructed (not at module load) - route handlers that import this
 * are evaluated by `next build` to collect their config, so throwing eagerly
 * when STRIPE_SECRET_KEY is unset would break the build for everyone, not
 * just whoever actually calls a billing route without the key configured.
 */
let client: Stripe | undefined;

function getClient(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is not set. Add a Stripe test-mode secret key to .env."
    );
  }
  client = new Stripe(key, { apiVersion: "2026-09-30.endive" });
  return client;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
