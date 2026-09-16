#!/usr/bin/env tsx
import { SHEET_HEADERS } from "@slipsheet/schema";

console.log("SlipSheet tab headers (row 1):");
console.log(SHEET_HEADERS.join("\t"));
console.log("\nPaste into Google Sheets row 1, or run ensureSheetHeaders via OAuth-connected API.");
