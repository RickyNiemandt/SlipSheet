#!/usr/bin/env tsx
/**
 * M5 QA runner — parses fixtures (live if GEMINI_API_KEY set) and checks anti-hallucination rules.
 * Exit 0 = PASS, 1 = FAIL
 */
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIDENCE_LOW_THRESHOLD, ParsedReceipt } from "@slipsheet/schema";
import { parseDocument, normalizeReceipt } from "@slipsheet/parse";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const FIXTURES = join(ROOT, "fixtures");
const GOLDEN = join(FIXTURES, "golden");

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

interface QaCase {
  id: string;
  path: string;
  liveQa: boolean;
}

interface QaResult {
  id: string;
  mode: "live" | "offline";
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

async function loadGolden(id: string): Promise<ParsedReceipt | null> {
  try {
    const raw = await readFile(join(GOLDEN, `${id}.json`), "utf8");
    return ParsedReceipt.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function discoverCases(): Promise<QaCase[]> {
  const dirs = ["pdf", "photos", "adversarial"];
  const cases: QaCase[] = [];

  for (const dir of dirs) {
    const folder = join(FIXTURES, dir);
    const files = await readdir(folder);
    for (const file of files) {
      const ext = extname(file).toLowerCase();
      if (!MIME[ext]) continue;
      const id = basename(file, ext);
      cases.push({
        id,
        path: join(folder, file),
        // Synthetic 1x1 PNG placeholders are offline-only until replaced with real SA slips
        liveQa: !(dir === "photos" || dir === "adversarial"),
      });
    }
  }

  return cases;
}

function assertAntiHallucination(receipt: ParsedReceipt, golden: ParsedReceipt | null): string | null {
  if (golden?.total_cents.value === null) {
    if (receipt.total_cents.value !== null && receipt.total_cents.confidence >= CONFIDENCE_LOW_THRESHOLD) {
      return `Hallucinated total: got ${receipt.total_cents.value} but golden expects null`;
    }
    if (receipt.total_cents.value === null && !receipt.warnings.some((w) => w.includes("total"))) {
      return "Expected total_not_visible or similar warning";
    }
    return null;
  }

  if (golden && typeof golden.total_cents.value === "number") {
    const actual = receipt.total_cents.value;
    if (actual !== null && actual !== golden.total_cents.value) {
      if (receipt.total_cents.confidence >= CONFIDENCE_LOW_THRESHOLD) {
        return `Wrong total with high confidence: expected ${golden.total_cents.value}, got ${actual}`;
      }
    }
  }

  if (golden?.tax_cents.value === null && receipt.tax_cents.value !== null) {
    return "Invented VAT when golden has none";
  }

  return null;
}

async function runOfflineCase(qc: QaCase): Promise<QaResult> {
  const golden = await loadGolden(qc.id);
  if (!golden) {
    return { id: qc.id, mode: "offline", status: "SKIP", detail: "no golden file" };
  }

  const normalized = normalizeReceipt(golden);
  const err = assertAntiHallucination(normalized, golden);
  if (err) {
    return { id: qc.id, mode: "offline", status: "FAIL", detail: err };
  }
  return { id: qc.id, mode: "offline", status: "PASS", detail: "normalize + golden rules OK" };
}

async function runLiveCase(qc: QaCase, apiKey: string): Promise<QaResult> {
  const golden = await loadGolden(qc.id);
  const ext = extname(qc.path).toLowerCase();
  const bytes = new Uint8Array(await readFile(qc.path));

  try {
    const receipt = await parseDocument({
      bytes,
      mimeType: MIME[ext]!,
      filename: basename(qc.path),
      apiKey,
    });

    const err = assertAntiHallucination(receipt, golden);
    if (err) {
      return { id: qc.id, mode: "live", status: "FAIL", detail: err };
    }

    const total =
      typeof receipt.total_cents.value === "number"
        ? `R ${(receipt.total_cents.value / 100).toFixed(2)}`
        : "(null)";
    return {
      id: qc.id,
      mode: "live",
      status: "PASS",
      detail: `vendor=${receipt.vendor.value ?? "?"} total=${total} conf=${receipt.total_cents.confidence.toFixed(2)}`,
    };
  } catch (e) {
    return {
      id: qc.id,
      mode: "live",
      status: "FAIL",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

function printTable(results: QaResult[]): void {
  console.log("\nSlipSheet M5 QA Report");
  console.log("=".repeat(72));
  console.log(`${"Fixture".padEnd(32)} ${"Mode".padEnd(8)} ${"Status".padEnd(6)} Detail`);
  console.log("-".repeat(72));
  for (const r of results) {
    console.log(`${r.id.padEnd(32)} ${r.mode.padEnd(8)} ${r.status.padEnd(6)} ${r.detail}`);
  }
  console.log("-".repeat(72));
}

async function main() {
  const cases = await discoverCases();
  const apiKey = process.env.GEMINI_API_KEY;
  const results: QaResult[] = [];

  for (const qc of cases) {
    results.push(await runOfflineCase(qc));

    if (qc.liveQa && apiKey) {
      results.push(await runLiveCase(qc, apiKey));
    } else if (qc.liveQa && !apiKey) {
      results.push({
        id: qc.id,
        mode: "live",
        status: "SKIP",
        detail: "set GEMINI_API_KEY for live parse",
      });
    } else {
      results.push({
        id: qc.id,
        mode: "live",
        status: "SKIP",
        detail: "replace placeholder photo with real SA slip for live QA",
      });
    }
  }

  printTable(results);

  const failures = results.filter((r) => r.status === "FAIL");
  const passes = results.filter((r) => r.status === "PASS");

  console.log(`\n${passes.length} passed, ${failures.length} failed, ${results.length - passes.length - failures.length} skipped`);

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
