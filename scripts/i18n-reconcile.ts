#!/usr/bin/env bun
/**
 * i18n Reconciliation Script
 *
 * Validates and reconciles locale files against en.json (source of truth).
 * Detects missing keys, extra keys, and structural mismatches.
 *
 * Usage:
 *   bun run scripts/i18n-reconcile.ts           # Check only
 *   bun run scripts/i18n-reconcile.ts --fix     # Auto-fix discrepancies
 *   bun run scripts/i18n-reconcile.ts --locale ja  # Check specific locale
 *   bun run scripts/i18n-reconcile.ts --ci      # CI mode (exit 1 if issues)
 */

import { readdirSync, readFileSync, writeFileSync, } from "fs";
import { join, } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Discrepancy {
  locale: string;
  type: "missing" | "extra" | "type_mismatch";
  key: string;
  expected?: unknown;
  actual?: unknown;
}

interface LocaleReport {
  locale: string;
  totalKeys: number;
  matchedKeys: number;
  missing: string[];
  extra: string[];
  typeMismatches: Array<{ key: string; expected: string; actual: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Flatten nested object to dot-notation keys
 */
function flatten(obj: Record<string, unknown>, prefix = "",): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value,] of Object.entries(obj,)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value,)) {
      Object.assign(result, flatten(value as Record<string, unknown>, fullKey,),);
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string,): unknown {
  const parts = path.split(".",);
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && !Array.isArray(current,)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Set nested value in object using dot notation
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown,): void {
  const parts = path.split(".",);
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== "object" || Array.isArray(current[part],)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]!] = value;
}

/**
 * Compare source and target locale files
 */
function compareLocales(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
): { missing: string[]; extra: string[]; typeMismatches: Array<{ key: string; expected: string; actual: string }> } {
  const sourceFlat = flatten(source,);
  const targetFlat = flatten(target,);

  const sourceKeys = new Set(Object.keys(sourceFlat,),);
  const targetKeys = new Set(Object.keys(targetFlat,),);

  const missing: string[] = [];
  const extra: string[] = [];
  const typeMismatches: Array<{ key: string; expected: string; actual: string }> = [];

  // Find missing keys (in source but not in target)
  for (const key of sourceKeys) {
    if (!targetKeys.has(key,)) {
      missing.push(key,);
    }
  }

  // Find extra keys (in target but not in source)
  for (const key of targetKeys) {
    if (!sourceKeys.has(key,)) {
      extra.push(key,);
    }
  }

  // Find type mismatches
  for (const key of sourceKeys) {
    if (targetKeys.has(key,)) {
      const sourceVal = sourceFlat[key];
      const targetVal = targetFlat[key];

      const sourceType = Array.isArray(sourceVal,) ? "array" : typeof sourceVal;
      const targetType = Array.isArray(targetVal,) ? "array" : typeof targetVal;

      if (sourceType !== targetType) {
        typeMismatches.push({
          key,
          expected: sourceType,
          actual: targetType,
        },);
      }
    }
  }

  return { missing, extra, typeMismatches, };
}

/**
 * Fix locale file by adding missing keys and removing extra keys
 */
function fixLocale(
  sourcePath: string,
  targetPath: string,
  missing: string[],
  extra: string[],
): void {
  const source = JSON.parse(readFileSync(sourcePath, "utf-8",),) as Record<string, unknown>;
  let target = JSON.parse(readFileSync(targetPath, "utf-8",),) as Record<string, unknown>;

  // Add missing keys with English fallback values
  for (const key of missing) {
    const value = getNestedValue(source, key,);
    setNestedValue(target, key, value,);
  }

  // Remove extra keys
  for (const key of extra) {
    const parts = key.split(".",);
    let current = target;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current) || typeof current[part] !== "object") {
        break;
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastKey = parts[parts.length - 1]!;
    if (lastKey in current) {
      delete current[lastKey];
    }
  }

  // Write fixed file
  writeFileSync(targetPath, JSON.stringify(target, null, 2,) + "\n", "utf-8",);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2,);
  const fixMode = args.includes("--fix",);
  const ciMode = args.includes("--ci",);
  const localeArg = args.find((a,) => a.startsWith("--locale=",))?.split("=",)[1];

  const localesDir = join(import.meta.dir, "../src/public/locales",);
  const sourceFile = join(localesDir, "en.json",);

  // Read source locale
  const source = JSON.parse(readFileSync(sourceFile, "utf-8",),) as Record<string, unknown>;
  const sourceFlat = flatten(source,);
  const sourceKeys = Object.keys(sourceFlat,);

  console.log("i18n Reconciliation Report",);
  console.log("═══════════════════════════\n",);
  console.log(`en.json: ${sourceKeys.length} keys (source of truth)\n`,);

  // Get all locale files
  const localeFiles = readdirSync(localesDir,)
    .filter((f,) => f.endsWith(".json",) && f !== "en.json")
    .map((f,) => f.replace(".json", "",));

  const localesToCheck = localeArg ? [localeArg,] : localeFiles;
  const reports: LocaleReport[] = [];
  let hasDiscrepancies = false;

  for (const locale of localesToCheck) {
    const localeFile = join(localesDir, `${locale}.json`,);

    try {
      const target = JSON.parse(readFileSync(localeFile, "utf-8",),) as Record<string, unknown>;
      const { missing, extra, typeMismatches, } = compareLocales(source, target,);

      const matchedKeys = sourceKeys.length - missing.length;

      reports.push({
        locale,
        totalKeys: sourceKeys.length,
        matchedKeys,
        missing,
        extra,
        typeMismatches,
      },);

      if (missing.length > 0 || extra.length > 0 || typeMismatches.length > 0) {
        hasDiscrepancies = true;
      }

      // Print report
      if (missing.length === 0 && extra.length === 0 && typeMismatches.length === 0) {
        console.log(`${locale}.json:`,);
        console.log(`  ✅ ${sourceKeys.length}/${sourceKeys.length} keys match\n`,);
      } else {
        console.log(`${locale}.json:`,);

        if (missing.length > 0) {
          console.log(`  ⚠️  ${missing.length} missing key(s):`,);
          missing.forEach((k,) => console.log(`    - ${k}`,));
        }

        if (extra.length > 0) {
          console.log(`  ℹ️  ${extra.length} extra key(s) (not in en.json):`,);
          extra.forEach((k,) => console.log(`    - ${k}`,));
        }

        if (typeMismatches.length > 0) {
          console.log(`  ❌ ${typeMismatches.length} type mismatch(es):`,);
          typeMismatches.forEach((m,) => console.log(`    - ${m.key}: expected ${m.expected}, got ${m.actual}`,));
        }

        console.log("",);
      }

      // Fix if requested
      if (fixMode && (missing.length > 0 || extra.length > 0)) {
        fixLocale(sourceFile, localeFile, missing, extra,);
        console.log(`  🔧 Fixed ${locale}.json\n`,);
      }
    } catch (error) {
      console.log(`${locale}.json:`,);
      console.log(`  ❌ Error reading file: ${error}\n`,);
      hasDiscrepancies = true;
    }
  }

  // Summary
  const completed = reports.filter((r,) => r.missing.length === 0).length;
  console.log("Summary:",);
  console.log(`  ${completed}/${reports.length} locales complete`,);

  if (hasDiscrepancies) {
    console.log(`  ⚠️  Discrepancies found`,);
  } else {
    console.log(`  ✅ All locales match en.json`,);
  }

  // CI mode
  if (ciMode && hasDiscrepancies) {
    process.exit(1,);
  }
}

main();
