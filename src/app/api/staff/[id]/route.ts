import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantSession } from "@/lib/auth/current-user";
import { runInTenantContext } from "@/lib/tenant-context";
import { hasPermission, canManageRoleAssignment, canActOnStaffMember } from "@/lib/permissions/service";

const updateStaffSchema = z.object({
  roleId: z.string().uuid(),
});

/** Reassigns a staff member's custom role. Admin itself is never assignable here - same restriction as creating a staff member. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();
    const json = await request.json().catch(() => null);
    const parsed = updateStaffSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { roleId } = parsed.data;

    const staff = await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "EDIT_STAFF");
      if (!allowed) throw new Error("FORBIDDEN");

      const staffProfile = await tx.staffProfile.findUnique({ where: { id }, include: { user: true } });
      if (!staffProfile || staffProfile.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      if (staffProfile.user.role !== "STAFF") throw new Error("NOT_REASSIGNABLE");
      if (staffProfile.userId === session.userId) throw new Error("CANNOT_REASSIGN_SELF");

      const role = await tx.role.findUnique({ where: { id: roleId } });
      if (!role || role.tenantId !== session.tenantId) throw new Error("INVALID_ROLE");

      // EDIT_STAFF alone says nothing about which role is being handed out -
      // without this, any role holding that one ordinary permission could
      // promote anyone to the most-privileged custom role in the tenant.
      const canReassign = await canManageRoleAssignment(
        tx,
        session.tenantId,
        session.role,
        session.roleId,
        staffProfile.user.roleId,
        roleId
      );
      if (!canReassign) throw new Error("RANK_TOO_LOW");

      await tx.user.update({ where: { id: staffProfile.userId }, data: { roleId } });

      return tx.staffProfile.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, email: true, username: true, role: true, customRole: { select: { id: true, name: true, level: true } } },
          },
        },
      });
    });

    return NextResponse.json({ staff });
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
    if (err instanceof Error && err.message === "NOT_REASSIGNABLE") {
      return NextResponse.json({ error: "This account's role can't be changed here." }, { status: 400 });
    }
    if (err instanceof Error && err.message === "CANNOT_REASSIGN_SELF") {
      return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
    }
    if (err instanceof Error && err.message === "INVALID_ROLE") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "RANK_TOO_LOW") {
      return NextResponse.json(
        { error: "Your role doesn't outrank that staff member's current or new role." },
        { status: 403 }
      );
    }
    console.error("Failed to update staff role", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await requireTenantSession();

    await runInTenantContext(session.tenantId, session.userId, session.role, async (tx) => {
      const allowed = await hasPermission(tx, session.tenantId, session.role, session.roleId, "DELETE_STAFF");
      if (!allowed) throw new Error("FORBIDDEN");

      const staffProfile = await tx.staffProfile.findUnique({ where: { id }, include: { user: true } });
      if (!staffProfile || staffProfile.tenantId !== session.tenantId) throw new Error("NOT_FOUND");
      if (staffProfile.userId === session.userId) throw new Error("CANNOT_DELETE_SELF");

      // DELETE_STAFF alone says nothing about rank - without this, any role
      // holding that one ordinary permission could delete an admin's account
      // outright (sidestepping the rank checks on reassignment above, since
      // there's no "new role" involved in a deletion to check).
      const canAct = await canActOnStaffMember(
        tx,
        session.tenantId,
        session.role,
        session.roleId,
        staffProfile.user.role,
        staffProfile.user.roleId
      );
      if (!canAct) throw new Error("RANK_TOO_LOW");

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
    if (err instanceof Error && err.message === "RANK_TOO_LOW") {
      return NextResponse.json({ error: "Your role doesn't outrank that staff member's role." }, { status: 403 });
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
