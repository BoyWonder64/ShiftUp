import type { Tx } from "@/lib/tenant-context";

export class TimeOffError extends Error {}

export async function getOwnStaffProfile(tx: Tx, userId: string) {
  return tx.staffProfile.findUnique({ where: { userId } });
}

export interface RequestTimeOffInput {
  staffProfileId: string;
  requestedByUserId: string;
  startTime: Date;
  endTime: Date;
  reason?: string | null;
}

export async function requestTimeOff(tx: Tx, tenantId: string, input: RequestTimeOffInput) {
  if (input.endTime <= input.startTime) {
    throw new TimeOffError("endTime must be after startTime");
  }
  return tx.timeOff.create({
    data: {
      tenantId,
      staffProfileId: input.staffProfileId,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason ?? null,
      requestedByUserId: input.requestedByUserId,
    },
  });
}

export async function listTimeOff(
  tx: Tx,
  options: { staffProfileId?: string; status?: "PENDING" | "APPROVED" | "DENIED" }
) {
  return tx.timeOff.findMany({
    where: {
      ...(options.staffProfileId ? { staffProfileId: options.staffProfileId } : {}),
      ...(options.status ? { status: options.status } : {}),
    },
    include: { staffProfile: { select: { id: true, displayName: true } } },
    orderBy: { startTime: "desc" },
  });
}

export async function reviewTimeOff(
  tx: Tx,
  id: string,
  reviewedByUserId: string,
  status: "APPROVED" | "DENIED"
) {
  return tx.timeOff.update({
    where: { id },
    data: { status, reviewedByUserId, reviewedAt: new Date() },
  });
}

/** Staff profile ids with APPROVED time off overlapping the given range. */
export async function staffOnApprovedLeave(
  tx: Tx,
  range: { start: Date; end: Date }
): Promise<Set<string>> {
  const rows = await tx.timeOff.findMany({
    where: {
      status: "APPROVED",
      startTime: { lt: range.end },
      endTime: { gt: range.start },
    },
    select: { staffProfileId: true },
  });
  return new Set(rows.map((r) => r.staffProfileId));
}
