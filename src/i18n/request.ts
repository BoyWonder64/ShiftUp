import { getRequestConfig } from "next-intl/server";
import { getCurrentSession } from "@/lib/auth/current-user";
import type { AppLocale } from "@/lib/auth/session";

/**
 * This app has no locale-prefixed routing (every URL stays the same
 * regardless of language, since the language is a per-user preference, not
 * part of the tenant's public URL shape) - so locale is resolved here from
 * the signed session cookie rather than from the URL. Falls back to "en" for
 * logged-out pages (login/signup/marketing), which aren't translated yet.
 */
const LOCALE_MAP: Record<AppLocale, string> = { EN: "en", ES: "es", DE: "de", FR: "fr" };

export default getRequestConfig(async () => {
  const session = await getCurrentSession();
  const locale = session ? LOCALE_MAP[session.locale] : "en";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
