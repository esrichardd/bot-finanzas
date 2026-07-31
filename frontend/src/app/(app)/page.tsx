import { getTranslations } from "next-intl/server";

import { getMe } from "../../lib/api/users";

export default async function DashboardPage() {
  const [t, me] = await Promise.all([getTranslations("dashboard"), getMe()]);

  return (
    <h1 className="text-2xl font-semibold">
      {t("greeting", { name: me.name })}
    </h1>
  );
}
