// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN QA Mode
 *
 * Quality assurance mode for VN content — validates scenes,
 * checks for missing assets, and reports issues.
 */

/** */
export interface VnQaIssue {
  sceneIndex: number;
  severity: "error" | "warning" | "info";
  message: string;
  field?: string;
}

/** */
export interface VnQaReport {
  totalScenes: number;
  issues: VnQaIssue[];
  passed: boolean;
}

// ── Validators ─────────────────────────────────────────────

/**
 * @param scene
 * @param scene.text
 * @param scene.characterName
 * @param scene.backgroundUrl
 * @param scene.role
 * @param index
 */
function validateScene(
  scene: { text: string; characterName: string; backgroundUrl?: string; role: string },
  index: number,
): VnQaIssue[] {
  const issues: VnQaIssue[] = [];

  if (!scene.text || scene.text.trim().length === 0) {
    issues.push({
      sceneIndex: index,
      severity: "error",
      message: "Scene has empty text content",
      field: "text",
    },);
  }

  if (scene.text && scene.text.length > 2000) {
    issues.push({
      sceneIndex: index,
      severity: "warning",
      message: `Scene text is very long (${scene.text.length} chars)`,
      field: "text",
    },);
  }

  if (scene.role !== "narration" && !scene.characterName) {
    issues.push({
      sceneIndex: index,
      severity: "warning",
      message: "Non-narration scene missing character name",
      field: "characterName",
    },);
  }

  if (!scene.backgroundUrl) {
    issues.push({
      sceneIndex: index,
      severity: "info",
      message: "Scene has no background image",
      field: "backgroundUrl",
    },);
  }

  return issues;
}

// ── Main QA Function ───────────────────────────────────────

/**
 * @param scenes
 */
export function runQaCheck(
  scenes: Array<{ text: string; characterName: string; backgroundUrl?: string; role: string }>,
): VnQaReport {
  const issues: VnQaIssue[] = [];

  for (const [i, scene,] of scenes.entries()) {
    if (scene) {
      issues.push(...validateScene(scene, i,),);
    }
  }

  // Check for long consecutive narration (potential pacing issue)
  let consecutiveNarration = 0;
  for (const [i, scene,] of scenes.entries()) {
    if (scene?.role === "narration") {
      consecutiveNarration++;
      if (consecutiveNarration >= 3) {
        issues.push({
          sceneIndex: i,
          severity: "warning",
          message: `${consecutiveNarration} consecutive narration scenes — consider adding dialogue`,
        },);
        consecutiveNarration = 0;
      }
    } else {
      consecutiveNarration = 0;
    }
  }

  return {
    totalScenes: scenes.length,
    issues,
    passed: issues.every((i,) => i.severity !== "error"),
  };
}

// ── UI Rendering ───────────────────────────────────────────

/**
 * @param report
 * @param container
 */
export function renderQaReport(
  report: VnQaReport,
  container: HTMLElement,
): void {
  container.replaceChildren();

  const header = document.createElement("h3",);
  header.textContent = `QA Report: ${report.totalScenes} scenes`;
  container.append(header,);

  if (report.passed) {
    const passEl = document.createElement("div",);
    passEl.className = "vn-qa-pass";
    passEl.textContent = "All checks passed";
    container.append(passEl,);
  }

  const issueList = document.createElement("ul",);
  issueList.className = "vn-qa-issues";

  for (const issue of report.issues) {
    const item = document.createElement("li",);
    item.className = `vn-qa-issue vn-qa-${issue.severity}`;
    item.textContent = `[Scene ${issue.sceneIndex + 1}] ${issue.message}`;
    issueList.append(item,);
  }

  container.append(issueList,);
}
