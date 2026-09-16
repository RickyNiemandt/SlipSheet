import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIDENCE_LOW_THRESHOLD, ParsedReceipt } from "@slipsheet/schema";
import { normalizeReceipt } from "@slipsheet/parse";

const GOLDEN_DIR = join(import.meta.dirname, "..", "fixtures", "golden");

async function loadGolden(name: string): Promise<ParsedReceipt> {
  const raw = await readFile(join(GOLDEN_DIR, `${name}.json`), "utf8");
  return ParsedReceipt.parse(JSON.parse(raw));
}

function assertNoInventedTotal(receipt: ParsedReceipt, golden: ParsedReceipt): void {
  const goldenTotal = golden.total_cents.value;
  const actualTotal = receipt.total_cents.value;

  if (goldenTotal === null) {
    expect(actualTotal).toBeNull();
    expect(receipt.warnings.some((w) => w.includes("total"))).toBe(true);
    return;
  }

  if (actualTotal !== null && actualTotal !== goldenTotal) {
    if (receipt.total_cents.confidence >= CONFIDENCE_LOW_THRESHOLD) {
      throw new Error(
        `Hallucinated total: expected ${goldenTotal} or null, got ${actualTotal} @ confidence ${receipt.total_cents.confidence}`,
      );
    }
  }
}

function assertNoVatInference(receipt: ParsedReceipt, golden: ParsedReceipt): void {
  if (golden.tax_cents.value === null) {
    expect(receipt.tax_cents.value).toBeNull();
  }
}

describe("parse-golden", () => {
  it("validates all golden files against schema", async () => {
    const files = await readdir(GOLDEN_DIR);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const raw = await readFile(join(GOLDEN_DIR, file), "utf8");
      expect(() => ParsedReceipt.parse(JSON.parse(raw))).not.toThrow();
    }
  });

  it("adversarial-no-total never invents total after normalize", async () => {
    const golden = await loadGolden("adversarial-no-total");
    const normalized = normalizeReceipt(golden);
    expect(normalized.total_cents.value).toBeNull();
    expect(normalized.warnings).toContain("total_not_visible");
  });

  it("adversarial-blurry keeps all key fields null or low confidence", async () => {
    const golden = await loadGolden("adversarial-blurry");
    const normalized = normalizeReceipt(golden);
    expect(normalized.total_cents.value).toBeNull();
    expect(normalized.vendor.value).toBeNull();
  });

  it("readable fixtures pass anti-hallucination checks after normalize", async () => {
    const ids = [
      "pdf-invoice-supplier-a",
      "pdf-invoice-supplier-b",
      "photo-till-slip-checkers",
      "photo-till-slip-spar",
    ];
    for (const id of ids) {
      const golden = await loadGolden(id);
      const normalized = normalizeReceipt(golden);
      assertNoInventedTotal(normalized, golden);
      assertNoVatInference(normalized, golden);
    }
  });

  it("pdf-invoice-supplier-a golden totals are consistent", async () => {
    const golden = await loadGolden("pdf-invoice-supplier-a");
    expect(golden.total_cents.value).toBe(28750);
    expect(golden.tax_cents.value).toBe(3750);
  });
});
