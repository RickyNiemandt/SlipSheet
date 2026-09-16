const ZAR_CENTS_REGEX = /^-?\d+$/;

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyParseError";
  }
}

/** Parse SA ZAR display string to integer cents. Rejects floats for cents storage. */
export function parseZarToCents(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new MoneyParseError("Empty amount");
  }

  const normalized = trimmed
    .replace(/^R\s*/i, "")
    .replace(/\s/g, "")
    .replace(/,/g, "");

  if (/^\d+$/.test(normalized)) {
    return Number(normalized) * 100;
  }

  const match = normalized.match(/^(-?\d+)\.(\d{1,2})$/);
  if (!match) {
    throw new MoneyParseError(`Invalid ZAR amount: ${input}`);
  }

  const whole = match[1]!;
  const frac = match[2]!.padEnd(2, "0");
  const sign = whole.startsWith("-") ? -1 : 1;
  const absWhole = Math.abs(Number(whole));
  return sign * (absWhole * 100 + Number(frac));
}

/** Format integer cents as SA ZAR display, e.g. R 1 234.56 */
export function formatCentsAsZar(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new MoneyParseError(`Cents must be an integer, got ${cents}`);
  }

  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}R ${wholeFormatted}.${frac}`;
}

export function assertIntegerCents(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new MoneyParseError(`${field} must be integer cents`);
  }
  if (!ZAR_CENTS_REGEX.test(String(value))) {
    throw new MoneyParseError(`${field} must be integer cents`);
  }
  return value;
}

export function centsRoundTrip(display: string): number {
  const cents = parseZarToCents(display);
  assertIntegerCents(cents, "cents");
  return cents;
}
