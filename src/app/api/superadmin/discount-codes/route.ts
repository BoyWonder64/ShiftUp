import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-user";
import { runInSystemContext } from "@/lib/tenant-context";

export async function GET() {
  try {
    await requireRole(["SUPERADMIN"]);
    const codes = await runInSystemContext((tx) =>
      tx.discountCode.findMany({ orderBy: { createdAt: "desc" } })
    );
    return NextResponse.json({ codes });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to list discount codes", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((s) => s.toUpperCase()),
  type: z.enum(["PERCENT", "FIXED_CENTS"]),
  value: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(["SUPERADMIN"]);
    const json = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (parsed.data.type === "PERCENT" && parsed.data.value > 100) {
      return NextResponse.json({ error: "A percent-off code can't exceed 100." }, { status: 400 });
    }

    const code = await runInSystemContext((tx) =>
      tx.discountCode.create({ data: parsed.data })
    );
    return NextResponse.json({ code }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "That code already exists." }, { status: 409 });
    }
    console.error("Failed to create discount code", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
