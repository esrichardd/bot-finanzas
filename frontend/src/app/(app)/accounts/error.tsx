"use client";

import { useTranslations } from "next-intl";

import { Button } from "../../../components/ui/button";

export default function AccountsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");

  return (
    <section className="mx-auto max-w-2xl space-y-4 py-16 text-center">
      <h1 className="font-serif text-3xl font-normal">{t("errorGeneric")}</h1>
      <Button onClick={reset}>{t("retry")}</Button>
    </section>
  );
}
