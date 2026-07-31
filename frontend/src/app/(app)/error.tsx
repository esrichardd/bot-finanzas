"use client";

import { useTranslations } from "next-intl";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  return (
    <div className="space-y-4" role="alert">
      <p className="text-destructive">{t("errorGeneric")}</p>
      <button
        className="text-primary underline underline-offset-4"
        onClick={reset}
        type="button"
      >
        {t("retry")}
      </button>
    </div>
  );
}
