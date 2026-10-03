import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { LanguageSettingsForm } from "@/components/LanguageSettingsForm";
import { CalendarTextSizeForm } from "@/components/CalendarTextSizeForm";

// Every tenant role (ADMIN and STAFF) reaches this section - unlike every
// other Settings section, it's never permission-gated (see sections.ts'
// "ALWAYS" requirement) since it's just each user's own login/password/
// language/calendar-text-size preference, not shared tenant config.
export default function AccountSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Account</h2>
      <LanguageSettingsForm />
      <CalendarTextSizeForm />
      <ChangePasswordForm />
    </div>
  );
}
