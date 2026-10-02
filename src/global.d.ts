import en from "@/messages/en.json";

// Types `useTranslations`/`getTranslations` namespace+key arguments against
// the English message file's actual shape, so a typo or a key that only
// exists in one locale's JSON is a compile error instead of a silent
// untranslated string at runtime.
declare global {
  interface IntlMessages extends Messages {}
}

type Messages = typeof en;
