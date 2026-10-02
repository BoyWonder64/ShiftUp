import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/current-user";
import { runInSystemContext } from "@/lib/tenant-context";

// Platform-wide tenant list for the SUPERADMIN console - "review all accounts
// and determine if there's an issue that needs to be resolved" from TODO.md's
// dev-role request. runInSystemContext bypasses RLS entirely, which is
// exactly what's needed here (every other tenant-scoped query in the app is
// deliberately confined to one tenant).
export async function GET() {
  try {
    await requireRole(["SUPERADMIN"]);

    const tenants = await runInSystemContext((tx) =>
      tx.tenant.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          license: true,
          _count: { select: { users: true, staffProfiles: true, appointments: true } },
        },
      })
    );

    return NextResponse.json({ tenants });
  } catch (err) {
    if (err instanceof Error && (err.message === "UNAUTHENTICATED" || err.message === "FORBIDDEN")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to list tenants", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
