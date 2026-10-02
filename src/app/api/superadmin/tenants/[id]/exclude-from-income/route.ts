import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInSystemContext } from "@/lib/tenant-context";

// Lets a test/demo/internal tenant carry a paid License (for feature-testing)
// without skewing the Income page's revenue totals/counts.
const patchSchema = z.object({
  excludeFromIncome: z.boolean(),
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

    const tenant = await runInSystemContext((tx) =>
      tx.tenant.update({
        where: { id },
        data: { excludeFromIncome: parsed.data.excludeFromIncome },
        select: { id: true, excludeFromIncome: true },
      })
    );
    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to update tenant income-exclusion", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
