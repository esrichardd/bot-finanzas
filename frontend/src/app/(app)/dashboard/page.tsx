import { getTranslations } from "next-intl/server";

import { getMe } from "../../../lib/api/users";

export default async function DashboardPage() {
  const [t, me] = await Promise.all([getTranslations("dashboard"), getMe()]);

  return (
    <section className="space-y-3 py-4 md:py-8">
      <p className="text-sm text-muted-foreground">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">
        {t("greeting", { name: me.name })}
      </h1>
    </section>
  );
}
