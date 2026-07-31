import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "locale";

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = raw === "en" ? "en" : "es";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
