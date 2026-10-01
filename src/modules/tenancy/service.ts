import type { Tx } from "@/lib/tenant-context";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && slug.length >= 3 && slug.length <= 63;
}

export async function getTenantBySlug(tx: Tx, slug: string) {
  return tx.tenant.findUnique({ where: { slug } });
}

export async function createTenant(
  tx: Tx,
  data: { name: string; slug: string; timezone: string }
) {
  return tx.tenant.create({ data });
}
