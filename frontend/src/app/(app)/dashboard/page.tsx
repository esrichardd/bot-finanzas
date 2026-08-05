import { getTranslations } from "next-intl/server";

import { getMe } from "../../../lib/api/users";
import { hasActiveNonCreditAccounts } from "../../../features/accounts/queries";
import Link from "next/link";
import { Button } from "../../../components/ui/button";

export default async function DashboardPage() {
  const [t, me, hasAccounts] = await Promise.all([getTranslations("dashboard"), getMe(), hasActiveNonCreditAccounts()]);

  return (
    <section className="space-y-3 py-4 md:py-8">
      <p className="text-sm text-muted-foreground">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl font-normal tracking-tight md:text-5xl">
        {t("greeting", { name: me.name })}
      </h1>
      {!hasAccounts ? (
        <div className="pt-4"><p className="text-muted-foreground">{t("emptyAccounts")}</p><Button className="mt-4" render={<Link href="/accounts" />}>{t("goToAccounts")}</Button></div>
      ) : null}
    </section>
  );
}
