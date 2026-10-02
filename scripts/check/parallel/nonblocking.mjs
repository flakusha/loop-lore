// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Non-blocking advisory checks for the parallel check runner: version drift,
 * frontend banned patterns, markdown links, and license compliance. Findings
 * are collected into the report's `nonBlocking` notes; they never gate.
 */

import { PROJECT_ROOT, } from "./config.mjs";

// ── Non-blocking checks ─────────────────────────────────────────

export async function runNonBlockingChecks(notes,) {
  console.log("\n=== Non-blocking checks ===",);

  // Version drift check
  try {
    const tagProc = Bun.spawn(["bash", "-c", "git tag --list v*",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await tagProc.exited;
    const tagText = await new Response(tagProc.stdout,).text();
    const tags = tagText.trim().split("\n",).filter(Boolean,);
    const latestTag = tags.at(-1,);

    const packageProc = Bun.spawn([
      "bash",
      "-c",
      'bun -p JSON.parse(require("fs").readFileSync("package.json","utf8")).version',
    ], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await packageProc.exited;
    const packageText = await new Response(packageProc.stdout,).text(),
      packageVersion = packageText.trim();

    if (latestTag && packageVersion) {
      const tagVersion = latestTag.replace(/^v/, "",);
      if (tagVersion === packageVersion) {
        console.log(`OK: Version in sync: ${packageVersion}`,);
        notes.push({ level: "ok", message: `Version in sync: ${packageVersion}`, },);
      } else {
        console.log(`warn: Version drift: package.json=${packageVersion}, latest tag=${tagVersion}`,);
        console.log("  Run 'bun run version:sync' to reconcile",);
        notes.push({
          level: "warn",
          message:
            `Version drift: package.json=${packageVersion}, latest tag=${tagVersion}; run 'bun run version:sync'`,
        },);
      }
    }
  } catch {
    console.log("warn: Version check skipped",);
    notes.push({ level: "skipped", message: "Version check skipped", },);
  }

  // Banned-pattern findings are advisory debt, but remain visible in the report.
  try {
    const bannedProc = Bun.spawn(["bun", "run", "scripts/check-frontend-banned-patterns.ts",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    const bannedExit = await bannedProc.exited;
    const [bannedStdout, bannedStderr,] = await Promise.all([
      new Response(bannedProc.stdout,).text(),
      new Response(bannedProc.stderr,).text(),
    ],);
    const bannedText = (bannedStdout + bannedStderr).trim();
    const level = bannedExit === 0 ? "ok" : "warn";
    console.log(
      `${bannedExit === 0 ? "OK" : "warn"}: Frontend banned-pattern check (${bannedExit === 0 ? "clean" : "findings"})`,
    );
    if (bannedText) { console.log(bannedText,); }
    notes.push({
      level,
      message: `Frontend banned-pattern check: ${bannedExit === 0 ? "clean" : "findings"}${
        bannedText ? `\n${bannedText.slice(0, 4000,)}` : ""
      }`,
    },);
  } catch (error) {
    notes.push({ level: "skipped", message: `Frontend banned-pattern check skipped: ${error.message}`, },);
  }

  try {
    const linksProc = Bun.spawn(["bash", "-c", "bun run md:links",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await linksProc.exited;
    const [stdout, stderr,] = await Promise.all([
      new Response(linksProc.stdout,).text(),
      new Response(linksProc.stderr,).text(),
    ],);
    const linksText = stdout + stderr;
    if (linksText.includes("broken",)) {
      console.log(`warn: Markdown stale-link check found broken internal links:`,);
      for (const line of linksText.trim().split("\n",)) {
        if (line.includes("broken target",)) { console.log(`  ${line}`,); }
      }
    } else {
      console.log("OK: Markdown links OK",);
      notes.push({ level: "ok", message: "Markdown links OK", },);
    }
  } catch (error) {
    console.log(`warn: Markdown stale-link check skipped (${error.message})`,);
    notes.push({ level: "skipped", message: `Markdown stale-link check skipped (${error.message})`, },);
  }

  // License compliance check (scancode + fossa — non-blocking, requires external tools)
  try {
    const licenseProc = Bun.spawn(["bash", "-c", "bun run license:check",], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },);
    await licenseProc.exited;
    const [stdout, stderr,] = await Promise.all([
      new Response(licenseProc.stdout,).text(),
      new Response(licenseProc.stderr,).text(),
    ],);
    const licenseText = stdout + stderr;
    const lines = licenseText.trim().split("\n",);
    // Show license check output (already prefixed with [license])
    const licenseNotes = [];
    for (const line of lines) {
      if (!line.startsWith("[license]",)) { continue; }
      console.log(`  ${line}`,);
      licenseNotes.push(line,);
    }
    if (licenseNotes.length > 0) {
      notes.push({ level: "info", message: licenseNotes.join("\n",), },);
    }
  } catch (error) {
    console.log(`warn: License compliance check skipped (${error.message})`,);
    notes.push({ level: "skipped", message: `License compliance check skipped (${error.message})`, },);
  }
}
