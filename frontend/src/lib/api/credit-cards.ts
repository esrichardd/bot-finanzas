import { apiFetch } from "./client";
import type { Account, Currency } from "./accounts";

export interface ConfiguredCreditCard {
  configured: true;
  account: Account & { type: "credit_card" };
  creditLimit: number;
  cutDay: number;
  paymentDueDay: number;
  managementFee: number | null;
  balance: number;
  debt: number;
  creditBalance: number;
  availableCredit: number;
  utilizationPercentage: number;
  nextCutDate: string;
  nextPaymentDueDate: string;
}

export interface IncompleteCreditCard {
  configured: false;
  account: Account & { type: "credit_card" };
  balance: number;
}

export type CreditCard = ConfiguredCreditCard | IncompleteCreditCard;
export type CreditCardStatus = "active" | "archived";

export interface OpenCreditCardPayload {
  name: string;
  currencyCode: string;
  institution?: string | null;
  creditLimit: number;
  cutDay: number;
  paymentDueDay: number;
  managementFee?: number | null;
  openingDebt?: { amount: number; occurredAt: string };
}

export interface UpdateCreditCardPayload {
  name: string;
  institution: string | null;
  creditLimit: number;
  cutDay: number;
  paymentDueDay: number;
  managementFee?: number | null;
}

export function listCreditCards(status: CreditCardStatus): Promise<CreditCard[]> {
  return apiFetch<CreditCard[]>(`/api/credit-cards?status=${status}`);
}

export function openCreditCard(input: OpenCreditCardPayload): Promise<ConfiguredCreditCard> {
  return apiFetch<ConfiguredCreditCard>("/api/credit-cards", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCreditCard(
  accountId: string,
  input: UpdateCreditCardPayload,
): Promise<ConfiguredCreditCard> {
  return apiFetch<ConfiguredCreditCard>(`/api/credit-cards/${encodeURIComponent(accountId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type CreditCardPageData = {
  active: CreditCard[];
  archived: CreditCard[];
  currencies: Currency[];
};
