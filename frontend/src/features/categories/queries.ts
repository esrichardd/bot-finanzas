import "server-only";

import { listCategories } from "../../lib/api/categories";

export async function getCategoriesPageData() {
  const [active, archived] = await Promise.all([
    listCategories("active"),
    listCategories("archived"),
  ]);
  return { active, archived };
}
