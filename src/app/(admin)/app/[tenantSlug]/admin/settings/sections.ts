import type { PermissionKey } from "@/lib/permissions/catalog";

export interface SettingsSection {
  slug: string;
  label: string;
  description: string;
  /**
   * Who can reach this section - Settings itself is open to every signed-in
   * tenant member now, not just ADMIN, but most sections hold business-wide
   * config that only ADMIN can act on (see e.g. `/api/tenant-settings`'s
   * ADMIN-only PUT, `/api/roles`, `/api/admin/permissions`), so those stay
   * "ADMIN". A few sections wrap a resource that's already delegable through
   * the permission matrix (Staff, Appointments' service types) - those use
   * that resource's existing VIEW_* key instead of inventing a new one.
   * "ALWAYS" is for the Account section, which is every user's own login/
   * password/language preference, never permission-gated.
   */
  requirement: "ALWAYS" | "ADMIN" | PermissionKey;
}

/** Single source of truth for the settings sub-nav and the settings index cards. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    slug: "appointments",
    label: "Appointments",
    description: "Appointment form fields and the service types clients can be booked for.",
    requirement: "VIEW_SERVICES",
  },
  {
    slug: "shifts",
    label: "Shifts",
    description: "What fields show up on the shift form.",
    requirement: "ADMIN",
  },
  {
    slug: "calendar",
    label: "Calendar",
    description: "Which holidays show on the calendar, the color key for appointments/shifts, and the calendar's visible hours.",
    requirement: "EDIT_CALENDAR_SETTINGS",
  },
  {
    slug: "company-profile",
    label: "Company Profile",
    description: "Your business logo and branding.",
    requirement: "ADMIN",
  },
  {
    slug: "staff",
    label: "Staff",
    description: "Add, edit, and remove staff accounts.",
    requirement: "VIEW_STAFF",
  },
  {
    slug: "permissions",
    label: "Permissions",
    description: "Define roles and decide what each one can do and see.",
    requirement: "ADMIN",
  },
  {
    slug: "account",
    label: "Account",
    description: "Your own login, password, and language preference.",
    requirement: "ALWAYS",
  },
];
