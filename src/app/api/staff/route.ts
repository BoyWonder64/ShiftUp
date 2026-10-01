import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";
import { createUser, findUserByEmail } from "@/modules/identity/service";
import { assertCanAddStaffProfile, PlanLimitError } from "@/lib/licensing/limits";

export async function GET() {
  try {
    const session = await requireTenantSession();
    const staff = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, "VIEW_STAFF");
      if (!allowed) throw new Error("FORBIDDEN");
      return tx.staffProfile.findMany({
        // Never select passwordHash - this response goes straight to the client.
        include: { user: { select: { id: true, email: true, role: true } } },
        orderBy: { displayName: "asc" },
      });
    });
    return NextResponse.json({ staff });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to list staff", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.enum(["MANAGER", "SUPERVISOR", "EMPLOYEE"]),
  displayName: z.string().min(1).max(200),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  timezone: z.string().min(1).max(100).default("UTC"),
});

/** Creates a new User + StaffProfile together - there's no separate "invite user" flow yet. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = createStaffSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const data = parsed.data;

    const staff = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, "CREATE_STAFF");
      if (!allowed) throw new Error("FORBIDDEN");
      await assertCanAddStaffProfile(tx, session.tenantId);

      const existing = await findUserByEmail(tx, data.email);
      if (existing) throw new Error("EMAIL_TAKEN");

      const user = await createUser(tx, {
        tenantId: session.tenantId,
        email: data.email,
        password: data.password,
        role: data.role,
      });

      return tx.staffProfile.create({
        data: {
          tenantId: session.tenantId,
          userId: user.id,
          displayName: data.displayName,
          bufferMinutes: data.bufferMinutes,
          timezone: data.timezone,
        },
      });
    });

    return NextResponse.json({ staff }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "EMAIL_TAKEN") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    if (err instanceof PlanLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Failed to create staff", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
