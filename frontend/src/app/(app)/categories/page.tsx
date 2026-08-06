import { getTranslations } from "next-intl/server";

import { CategoriesScreen } from "../../../features/categories/components/categories-screen";
import { getCategoriesPageData } from "../../../features/categories/queries";

export default async function CategoriesPage() {
  const [data, t] = await Promise.all([getCategoriesPageData(), getTranslations("categories")]);
  return <CategoriesScreen data={data} subtitle={t("subtitle")} title={t("title")} />;
}
