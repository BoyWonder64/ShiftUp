import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

/**
 * Every tenant-scoped DB access in this app must go through runInTenantContext
 * (or runInSystemContext for server-controlled cross-tenant operations). Both
 * open a transaction and set Postgres session vars that the RLS policies from
 * the enable_rls migration key off of - so tenant isolation is enforced at the
 * database level even if a repository forgets to filter by tenantId.
 */

export type TenantRole = "ADMIN" | "STAFF";

export type TenantContext =
  | { kind: "tenant"; tenantId: string; userId: string; role: TenantRole }
  | { kind: "system" };

const storage = new AsyncLocalStorage<TenantContext>();

/** Read the context of the currently running tenant/system operation. */
export function getContext(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "No tenant context set. Wrap this call in runInTenantContext() or runInSystemContext()."
    );
  }
  return ctx;
}

export type Tx = Prisma.TransactionClient;

async function applyContextToTx(tx: Tx, ctx: TenantContext) {
  if (ctx.kind === "system") {
    await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
    await tx.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
  } else {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
  }
}

/** Runs fn inside a DB transaction scoped to one tenant; RLS confines every query in fn to that tenant's rows. */
export async function runInTenantContext<T>(
  tenantId: string,
  userId: string,
  role: TenantRole,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  const ctx: TenantContext = { kind: "tenant", tenantId, userId, role };
  return storage.run(ctx, () =>
    prisma.$transaction(async (tx) => {
      await applyContextToTx(tx, ctx);
      return fn(tx);
    })
  );
}

/**
 * Runs fn with RLS bypassed entirely, for server-controlled operations that must
 * cross tenant boundaries (tenant signup, platform superadmin actions). The
 * `kind: "system"` value here is fixed by this module, not by any caller input -
 * never derive it from a request parameter.
 */
export async function runInSystemContext<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const ctx: TenantContext = { kind: "system" };
  return storage.run(ctx, () =>
    prisma.$transaction(async (tx) => {
      await applyContextToTx(tx, ctx);
      return fn(tx);
    })
  );
}
