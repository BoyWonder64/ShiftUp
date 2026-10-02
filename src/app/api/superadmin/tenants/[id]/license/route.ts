import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInSystemContext } from "@/lib/tenant-context";
import { setLicensePlan } from "@/modules/licensing/service";

// Direct write to a tenant's License, bypassing Stripe checkout entirely -
// the "real write action on License.billingPlan/status" TODO.md's dev-role
// item explicitly asked for (comping an account, testing paid-tier features
// without a real charge, or manually fixing a billing issue).
const patchSchema = z.object({
  billingPlan: z.enum(["FREE", "ONE_TIME", "SUBSCRIPTION"]),
  status: z.enum(["ACTIVE", "EXPIRED"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireRole(["SUPERADMIN"]);
    const json = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const license = await runInSystemContext((tx) => setLicensePlan(tx, id, parsed.data));
    return NextResponse.json({ license });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update tenant license", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
