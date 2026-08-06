import "server-only";

import { listCurrencies } from "../../lib/api/accounts";
import { listCategories } from "../../lib/api/categories";
import { listCreditCards } from "../../lib/api/credit-cards";

export async function getCreditCardsPageData() {
  const [active, archived, currencies, categories] = await Promise.all([
    listCreditCards("active"),
    listCreditCards("archived"),
    listCurrencies(),
    listCategories("active"),
  ]);
  return { active, archived, currencies, categories };
}

export type CreditCardsPageData = Awaited<ReturnType<typeof getCreditCardsPageData>>;
