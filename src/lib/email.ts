import "server-only";
import { Resend } from "resend";

/**
 * Transactional email - currently backed by Resend. Every call site goes
 * through sendEmail() below, not the Resend client directly, so swapping to
 * a different provider later (e.g. a self-hosted SMTP server) only means
 * rewriting this one file - no caller changes.
 *
 * Lazily constructed, same reasoning as src/lib/stripe.ts's client: route
 * handlers that import this are evaluated by `next build` to collect their
 * config, so throwing eagerly when RESEND_API_KEY is unset would break the
 * build for everyone, not just whoever actually calls a route that sends
 * mail without the key configured.
 */
let client: Resend | undefined;

function getClient(): Resend {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY environment variable is not set. Add a Resend API key to .env - see .env's comment for where to get one."
    );
  }
  client = new Resend(key);
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Throws on failure - callers decide how to surface that (e.g. a generic 500). */
export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM environment variable is not set. Add a from-address to .env.");
  }
  const { error } = await getClient().emails.send({ from, to, subject, html, text });
  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
