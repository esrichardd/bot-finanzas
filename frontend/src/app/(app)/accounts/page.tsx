import { getTranslations } from "next-intl/server";

import { AccountsScreen } from "../../../features/accounts/components/accounts-screen";
import { getAccountsPageData } from "../../../features/accounts/queries";

export default async function AccountsPage() {
  const [data, t] = await Promise.all([
    getAccountsPageData(),
    getTranslations("accounts"),
  ]);
  return <AccountsScreen data={data} subtitle={t("subtitle")} title={t("title")} />;
}
