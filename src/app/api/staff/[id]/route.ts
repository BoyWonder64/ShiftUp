import { NextRequest, NextResponse } from "next/server";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission } from "@/lib/permissions/service";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "DELETE_STAFF");
      if (!allowed) throw new Error("FORBIDDEN");

      const staffProfile = await tx.staffProfile.findUnique({ where: { id } });
      if (!staffProfile || staffProfile.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      if (staffProfile.userId === session.userId) throw new Error("CANNOT_DELETE_SELF");

      // Appointment.staff is onDelete: Restrict (unlike ScheduleTemplateShift,
      // which cascades) - existing appointments must be reassigned or
      // cancelled first, same reasoning as Role deletion below.
      const appointmentCount = await tx.appointment.count({ where: { staffId: id } });
      if (appointmentCount > 0) throw new Error("STAFF_HAS_APPOINTMENTS");

      // Deletes the User, not the StaffProfile directly - StaffProfile.user is
      // onDelete: Cascade, so this also removes the profile and their working
      // hours/time-off/template shifts in one go.
      await tx.user.delete({ where: { id: staffProfile.userId } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Not authorized." }, { status: 401 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (err instanceof Error && err.message === "CANNOT_DELETE_SELF") {
      return NextResponse.json({ error: "You can't remove your own staff account." }, { status: 400 });
    }
    if (err instanceof Error && err.message === "STAFF_HAS_APPOINTMENTS") {
      return NextResponse.json(
        { error: "This staff member has appointments or shifts on the calendar. Reassign or cancel them first." },
        { status: 409 }
      );
    }
    console.error("Failed to delete staff", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
