import { describe, expect, it } from "vitest";
import {
  MoneyParseError,
  assertIntegerCents,
  centsRoundTrip,
  formatCentsAsZar,
  parseZarToCents,
} from "@slipsheet/money";

describe("money", () => {
  it("parses ZAR display strings to integer cents", () => {
    expect(parseZarToCents("R 123.45")).toBe(12345);
    expect(parseZarToCents("R1,234.56")).toBe(123456);
    expect(parseZarToCents("99")).toBe(9900);
  });

  it("formats cents as ZAR", () => {
    expect(formatCentsAsZar(123456)).toBe("R 1 234.56");
    expect(formatCentsAsZar(9900)).toBe("R 99.00");
  });

  it("round-trips common amounts", () => {
    expect(centsRoundTrip("R 115.00")).toBe(11500);
  });

  it("rejects non-integer cents", () => {
    expect(() => assertIntegerCents(12.5, "total")).toThrow(MoneyParseError);
    expect(() => formatCentsAsZar(12.5)).toThrow(MoneyParseError);
  });

  it("rejects invalid strings", () => {
    expect(() => parseZarToCents("R abc")).toThrow(MoneyParseError);
  });
});
