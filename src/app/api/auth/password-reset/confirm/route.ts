import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runInSystemContext } from "@/lib/tenant-context";
import { confirmPasswordReset } from "@/modules/identity/passwordReset";

const confirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await runInSystemContext((tx) =>
    confirmPasswordReset(tx, parsed.data.token, parsed.data.newPassword)
  );

  if (result === "INVALID_OR_EXPIRED") {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
