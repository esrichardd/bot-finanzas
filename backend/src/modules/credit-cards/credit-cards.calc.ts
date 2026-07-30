/** Deuda actual: el balance negativo expresado en positivo. */
export function currentDebt(balance: number): number {
  return Math.max(0, -balance);
}

/** Cupo disponible: límite + balance. Nunca negativo. */
export function availableCredit(creditLimit: number, balance: number): number {
  return Math.max(0, creditLimit + balance);
}

/** Próxima ocurrencia de un día del mes, clampeado al último día del mes. */
export function nextOccurrence(day: number, from: string): string {
  const [y, m, d] = from.split("-").map(Number);
  let year = y!;
  let month = m!;
  if (d! > day) {
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clamped = Math.min(day, lastDayOfMonth);
  return `${year}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}
