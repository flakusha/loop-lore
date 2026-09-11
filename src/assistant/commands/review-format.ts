// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 65

export interface ReviewIssue {
  field: string;
  issue: string;
  severity: "warning" | "error" | "info";
}

/**
 * @param items
 * @param prefix
 * @returns string
 */
function formatIssueLines(items: ReviewIssue[], prefix: string,): string {
  return Array.from(items, (i,) => `- ${prefix} ${i.field}: ${i.issue}`,).join("\n",);
}

/**
 * Format a review report from issues.
 * Shared by character, world, and location review cases.
 * @param entityLabel
 * @param entityName
 * @param issues
 * @returns void
 */
export function formatReviewReport(entityLabel: string, entityName: string, issues: ReviewIssue[],): string {
  let report = `**${entityLabel} Review: ${entityName}**\n\n`;

  if (issues.length === 0) {
    report += `✅ ${entityLabel} is well-defined with sufficient detail.`;
    return report;
  }

  const errors: typeof issues = [];
  const warnings: typeof issues = [];
  const info: typeof issues = [];
  for (const i of issues) {
    if (i.severity === "error") { errors.push(i,); }
    else if (i.severity === "warning") { warnings.push(i,); }
    else { info.push(i,); }
  }

  if (errors.length > 0) {
    report += `**Errors (${errors.length}):**\n`;
    report += `${formatIssueLines(errors, "❌",)}\n\n`;
  }
  if (warnings.length > 0) {
    report += `**Warnings (${warnings.length}):**\n`;
    report += `${formatIssueLines(warnings, "⚠️",)}\n\n`;
  }
  if (info.length > 0) {
    report += `**Suggestions (${info.length}):**\n`;
    report += `${formatIssueLines(info, "💡",)}\n\n`;
  }

  report += `**Summary:** ${errors.length} errors, ${warnings.length} warnings, ${info.length} suggestions`;
  return report;
}
