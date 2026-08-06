import { getTranslations } from "next-intl/server";

import { CreditCardsScreen } from "../../../features/credit-cards/components/credit-cards-screen";
import { getCreditCardsPageData } from "../../../features/credit-cards/queries";

export default async function CreditCardsPage() {
  const [data, t] = await Promise.all([getCreditCardsPageData(), getTranslations("creditCards")]);
  return <CreditCardsScreen data={data} subtitle={t("subtitle")} title={t("title")} />;
}
