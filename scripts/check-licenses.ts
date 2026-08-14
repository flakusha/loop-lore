// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * License compliance gate — wraps scancode and fossa to enforce LGPL purity.
 *
 * Since src/ is LGPL-3.0-or-later, it MUST NOT include GPL or AGPL code.
 * This script:
 *   1. Runs scancode against src/ to detect source-level license violations
 *   2. Runs fossa analyze to detect dependency-level license violations
 *   3. Exits non-zero if any GPL/AGPL is found (in strict mode)
 *
 * Tool availability (both FOSS):
 *   - scancode: `pip install scancode-toolkit` (Apache-2.0)
 *   - fossa: `curl -H 'Cache-Control: no-cache' https://raw.githubusercontent.com/fossas/fossa-cli/master/install-latest.sh | bash` (CPAL-1.0)
 *     Note: `fossa analyze --output` works without an API key (output mode disables telemetry/upload).
 *     A key is only needed for `fossa test` (upload to FOSSA dashboard).
 *
 * Modes:
 *   - Default: warns about violations, exits 0 (non-blocking)
 *   - LICENSE_CHECK=1 or --strict: exits 1 on any violation (blocking gate)
 *
 * Usage:
 *   bun run scripts/check-licenses.ts              # warn-only
 *   LICENSE_CHECK=1 bun run scripts/check-licenses.ts   # blocking
 *   bun run scripts/check-licenses.ts --strict     # blocking
 */
import { $, } from "bun";

// ── Config ──────────────────────────────────────────────────────

/** Licenses incompatible with LGPL-3.0-or-later in src/ */
const FORBIDDEN_LICENSES = [
  "GPL-2.0",
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "AGPL-1.0",
  "AGPL-1.0-only",
  "AGPL-1.0-or-later",
  "AGPL-3.0",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
];

/** Patterns that indicate GPL/AGPL in license strings */
const GPL_PATTERNS = [
  /\bAGPL\b/i,
  /\bGPL\b/i,
];

// ── Helpers ─────────────────────────────────────────────────────

async function toolExists(name: string,): Promise<boolean> {
  try {
    await $`${name} --version`.quiet();
    return true;
  } catch {
    return false;
  }
}

function isForbiddenLicense(license: string,): boolean {
  // Check exact SPDX matches
  if (FORBIDDEN_LICENSES.some((f,) => license.includes(f,))) {
    return true;
  }
  // Check pattern matches (catches non-SPDX strings like "GPL v2")
  if (GPL_PATTERNS.some((p,) => p.test(license,))) {
    return true;
  }
  return false;
}

// ── scancode ────────────────────────────────────────────────────

interface ScancodeViolation {
  file: string;
  license: string;
  startLine?: number;
  endLine?: number;
}

async function runScancode(): Promise<ScancodeViolation[]> {
  const violations: ScancodeViolation[] = [];

  try {
    const proc = $`scancode --license --package --json - src/`.quiet();
    const output = await proc.text();
    const files = JSON.parse(output,);

    for (const file of files) {
      if (!file.license_detections) { continue; }

      for (const detection of file.license_detections) {
        const license = detection.license ?? detection.spdx_license_expression ?? "";
        if (isForbiddenLicense(license,)) {
          violations.push({
            file: file.path,
            license,
            startLine: detection.start_line,
            endLine: detection.end_line,
          },);
        }
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error,);
    if (msg.includes("Command not found",) || msg.includes("ENOENT",)) {
      console.warn("[license] scancode not found — skipping source scan",);
      console.warn("  Install: pip install scancode-toolkit",);
    } else {
      console.warn(`[license] scancode failed: ${msg.split("\n",)[0]}`,);
    }
  }

  return violations;
}

// ── fossa ───────────────────────────────────────────────────────

interface FossaViolation {
  dependency: string;
  license: string;
  path?: string;
}

async function runFossa(): Promise<FossaViolation[]> {
  const violations: FossaViolation[] = [];

  try {
    // fossa analyze produces analysis results; --output writes JSON
    const proc = $`fossa analyze --output`.quiet();
    const output = await proc.text();
    const data = JSON.parse(output,);

    // Navigate fossa's dependency tree
    const deps = data?.dependencies ?? data?.rawDependencies ?? [];
    for (const dep of deps) {
      const licenses = dep.licenses ?? dep.license ?? [];
      const licenseList = Array.isArray(licenses,) ? licenses : [licenses,];

      for (const lic of licenseList) {
        const licStr = typeof lic === "string" ? lic : (lic?.id ?? lic?.name ?? "");
        if (isForbiddenLicense(licStr,)) {
          violations.push({
            dependency: dep.name ?? dep.manifest ?? "unknown",
            license: licStr,
            path: dep.path,
          },);
        }
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error,);
    if (msg.includes("Command not found",) || msg.includes("ENOENT",)) {
      console.warn("[license] fossa not found — skipping dependency scan",);
      console.warn(
        "  Install: curl -H 'Cache-Control: no-cache' https://raw.githubusercontent.com/fossas/fossa-cli/master/install-latest.sh | bash",
      );
    } else {
      console.warn(`[license] fossa failed: ${msg.split("\n",)[0]}`,);
    }
  }

  return violations;
}

// ── Main ────────────────────────────────────────────────────────

const BLOCKING = process.env.LICENSE_CHECK === "1" || process.argv.includes("--strict",);

async function main() {
  console.log("[license] Running license compliance checks...",);

  // Check tool availability
  const hasScancode = await toolExists("scancode",);
  const hasFossa = await toolExists("fossa",);

  if (!hasScancode && !hasFossa) {
    console.warn("[license] Neither scancode nor fossa installed — skipping",);
    console.warn("  scancode: pip install scancode-toolkit",);
    console.warn(
      "  fossa:    curl -H 'Cache-Control: no-cache' https://raw.githubusercontent.com/fossas/fossa-cli/master/install-latest.sh | bash",
    );
    console.warn("\nNon-blocking — tools not available.",);
    process.exit(0,);
  }

  // Run both checks in parallel
  const [scancodeViolations, fossaViolations,] = await Promise.all([
    hasScancode ? runScancode() : Promise.resolve([],),
    hasFossa ? runFossa() : Promise.resolve([],),
  ],);

  const totalViolations = scancodeViolations.length + fossaViolations.length;

  // Report results
  if (scancodeViolations.length > 0) {
    console.error(`\n[license] scancode: ${scancodeViolations.length} GPL/AGPL violation(s) in src/:`,);
    for (const v of scancodeViolations) {
      const loc = v.startLine ? `:${v.startLine}` : "";
      console.error(`  ${v.file}${loc} → ${v.license}`,);
    }
  } else if (hasScancode) {
    console.log("[license] scancode: no GPL/AGPL detected in src/",);
  }

  if (fossaViolations.length > 0) {
    console.error(`\n[license] fossa: ${fossaViolations.length} GPL/AGPL dependency(ies):`,);
    for (const v of fossaViolations) {
      console.error(`  ${v.dependency} → ${v.license}`,);
    }
  } else if (hasFossa) {
    console.log("[license] fossa: no GPL/AGPL dependencies detected",);
  }

  // Exit logic
  if (totalViolations > 0 && BLOCKING) {
    console.error(`\n[license] ${totalViolations} violation(s) — CI gate failed.`,);
    console.error("  src/ is LGPL-3.0-or-later; GPL/AGPL code is forbidden.",);
    process.exit(1,);
  }

  if (totalViolations > 0) {
    console.warn(`\n[license] ${totalViolations} violation(s) found. Non-blocking — set LICENSE_CHECK=1 to enforce.`,);
  } else {
    console.log("[license] All checks passed.",);
  }

  process.exit(0,);
}

main();
