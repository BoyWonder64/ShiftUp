import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runInSystemContext } from "@/lib/tenant-context";
import { requestPasswordReset } from "@/modules/identity/passwordReset";
import { sendEmail } from "@/lib/email";

const requestSchema = z.object({
  email: z.string().email(),
});

// Same generic response whether or not the email belongs to an account -
// don't leak which emails have accounts (same reasoning as login's "same
// error for no-such-user and wrong-password").
const GENERIC_MESSAGE = "If an account exists for that email, we've sent a password reset link.";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await runInSystemContext((tx) => requestPasswordReset(tx, parsed.data.email));

  if (result) {
    const resetUrl = `${request.nextUrl.origin}/reset-password?token=${result.rawToken}`;
    try {
      await sendEmail({
        to: parsed.data.email,
        subject: "Reset your ShiftUp password",
        text: `Reset your password: ${resetUrl}\n\nThis link expires in 30 minutes. If you didn't request this, you can ignore this email.`,
        html: `<p>Someone requested a password reset for your ShiftUp account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>`,
      });
    } catch (err) {
      // Don't leak send failures to the client - same generic response
      // either way - but do log (including the link itself) so a real
      // delivery outage is visible server-side, and so the link can still
      // be relayed manually, instead of silently failing every reset.
      console.error("Failed to send password reset email", { to: parsed.data.email, resetUrl, err });
    }
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
