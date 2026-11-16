/**
 * Formats a numeric price using the active locale's number formatting rules.
 */
export function formatAmount(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(amount);
}
