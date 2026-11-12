import type { Tx } from "@/lib/tenant-context";
import { createAppointment, SchedulingConflictError, type CreateAppointmentInput } from "./service";

/** Caps one "repeat" request, first occurrence included (same cap schedule templates use for weekly-for-a-year). */
export const MAX_REPEAT_OCCURRENCES = 52;

export interface RepeatSkip {
  startTime: Date;
  /** CONFLICT: that date double-books this staff member. LIMIT: the plan's appointment cap was hit, so this and every later date were not created. */
  reason: "CONFLICT" | "LIMIT";
}

export interface RepeatResult {
  /** In date order; the first entry is the occurrence the user actually picked (unless it was skipped). */
  created: Awaited<ReturnType<typeof createAppointment>>[];
  skipped: RepeatSkip[];
}

/**
 * Creates the same entry on several dates - `input.startTime` plus each of
 * `extraStarts` - keeping the original's length for every copy. The dates
 * themselves are worked out by the caller (the browser, in the user's own
 * timezone) rather than here, so "every Monday at 9:00" stays 9:00 local
 * across a daylight-saving change instead of drifting to the server's clock.
 *
 * A date that would double-book the staff member is skipped and reported
 * rather than failing the whole series, matching how schedule templates
 * behave. Conflicts are detected with an explicit read before each insert:
 * for an entry with a client the database's EXCLUDE constraint would also
 * catch it, but a violated constraint aborts the whole Postgres transaction,
 * so it can't be caught and carried on from. (A clientless entry's overlap
 * rule is already an app-level check inside createAppointment.)
 *
 * `beforeEach` runs ahead of every create (the plan-limit check). If it
 * throws once something has been created, the series stops there and the
 * remaining dates are reported as LIMIT; if it throws before anything was
 * created, the error propagates unchanged.
 *
 * Throws SchedulingConflictError only when *no* date could be created.
 */
export async function createRepeatingAppointments(
  tx: Tx,
  tenantId: string,
  input: CreateAppointmentInput,
  extraStarts: Date[],
  beforeEach?: () => Promise<void>
): Promise<RepeatResult> {
  const durationMs = input.endTime.getTime() - input.startTime.getTime();
  const starts = [input.startTime, ...extraStarts].slice(0, MAX_REPEAT_OCCURRENCES);

  const result: RepeatResult = { created: [], skipped: [] };
  for (let i = 0; i < starts.length; i++) {
    const startTime = starts[i];
    const endTime = new Date(startTime.getTime() + durationMs);

    if (input.clientId) {
      const clash = await tx.appointment.findFirst({
        where: {
          staffId: input.staffId,
          clientId: { not: null },
          status: { not: "CANCELLED" },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        select: { id: true },
      });
      if (clash) {
        result.skipped.push({ startTime, reason: "CONFLICT" });
        continue;
      }
    }

    try {
      await beforeEach?.();
    } catch (err) {
      if (result.created.length === 0) throw err;
      for (const rest of starts.slice(i)) result.skipped.push({ startTime: rest, reason: "LIMIT" });
      break;
    }

    try {
      result.created.push(await createAppointment(tx, tenantId, { ...input, startTime, endTime }));
    } catch (err) {
      if (!(err instanceof SchedulingConflictError)) throw err;
      result.skipped.push({ startTime, reason: "CONFLICT" });
    }
  }

  if (result.created.length === 0) throw new SchedulingConflictError();
  return result;
}
