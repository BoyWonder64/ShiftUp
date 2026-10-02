export interface SuperadminSection {
  slug: string;
  label: string;
  description: string;
}

/** Single source of truth for the dev console's left-hand nav. */
export const SUPERADMIN_SECTIONS: SuperadminSection[] = [
  {
    slug: "overview",
    label: "Income",
    description: "Recurring and one-time revenue across every tenant, and how many are on each plan.",
  },
  {
    slug: "customers",
    label: "Customers",
    description: "Every tenant on the platform - override a tenant's billing plan or status by hand.",
  },
  {
    slug: "discount-codes",
    label: "Discount codes",
    description: "Create and manage codes for quoting a negotiated discount.",
  },
  {
    slug: "account",
    label: "Account",
    description: "Your own dev-console login and password.",
  },
];
