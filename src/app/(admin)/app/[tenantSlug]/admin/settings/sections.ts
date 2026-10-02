export interface SettingsSection {
  slug: string;
  label: string;
  description: string;
}

/** Single source of truth for the settings sub-nav and the settings index cards. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    slug: "appointments",
    label: "Appointments",
    description: "Appointment form fields and the service types clients can be booked for.",
  },
  {
    slug: "shifts",
    label: "Shifts",
    description: "What fields show up on the shift form.",
  },
  {
    slug: "calendar",
    label: "Calendar",
    description: "Color key for appointments/shifts, and which holidays show on the calendar.",
  },
  {
    slug: "company-profile",
    label: "Company Profile",
    description: "Your business logo and branding.",
  },
  {
    slug: "staff",
    label: "Staff",
    description: "Add, edit, and remove staff accounts.",
  },
  {
    slug: "permissions",
    label: "Permissions",
    description: "Define roles and decide what each one can do and see.",
  },
  {
    slug: "account",
    label: "Account",
    description: "Your own login and password.",
  },
];
