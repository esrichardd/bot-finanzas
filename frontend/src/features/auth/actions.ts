"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, LOCALES, type Locale } from "../../i18n/request";

export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
