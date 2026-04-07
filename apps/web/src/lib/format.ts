let formattingLocale = "en-US";

export function setFormattingLocale(locale: string): void {
  formattingLocale = locale;
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat(formattingLocale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

export function formatRelativeDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(formattingLocale, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short"
  }).format(date);
}
