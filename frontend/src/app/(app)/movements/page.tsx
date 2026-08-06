import { getTranslations } from "next-intl/server";

import { MovementsScreen } from "../../../features/movements/components/movements-screen";
import { getMovementsPageData, ledgerQueryFromSearchParams, movementPrefillFromSearchParams } from "../../../features/movements/queries";

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = ledgerQueryFromSearchParams(params);
  const [data, t] = await Promise.all([getMovementsPageData(query), getTranslations("movements")]);
  return <MovementsScreen data={data} initialCreate={movementPrefillFromSearchParams(params, data)} query={query} subtitle={t("subtitle")} title={t("title")} />;
}
