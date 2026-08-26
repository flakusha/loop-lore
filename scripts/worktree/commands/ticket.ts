// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { resolve, } from "path";
import type { WorktreeConfig, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { log, } from "../utils/output";

const VALID_TYPES = ["BUG", "FEAT", "FIX", "IDEA", "TASK", "SOL", "INFRA",] as const;
type TicketType = typeof VALID_TYPES[number];

const VALID_PRIORITIES = ["low", "medium", "high", "critical",] as const;
const VALID_EFFORTS = ["Small", "Medium", "Large", "XL",] as const;

interface TicketFlags {
  labels: string[];
  priority: string;
  epic: string;
  effort: string;
}

function kebab(title: string,): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-",)
    .replace(/^-|-$/g, "",)
    .slice(0, 60,);
}

export async function ticket(args: string[], config: WorktreeConfig,): Promise<void> {
  const typeRaw = args[0]?.toUpperCase() ?? "";
  const title = args[1];
  const body = args[2] ?? "";

  if (!typeRaw || !title) {
    log("error", "type and title required",);
    console.log("  Usage: ticket <TYPE> <title> [body] [--label X] [--priority X] [--epic X] [--effort X]",);
    console.log(`  TYPE: ${VALID_TYPES.join(", ",)}`,);
    process.exit(1,);
  }

  if (!(VALID_TYPES as readonly string[]).includes(typeRaw,)) {
    log("error", `unknown type '${typeRaw}' — use: ${VALID_TYPES.join(", ",)}`,);
    process.exit(1,);
  }

  const type = typeRaw as TicketType;
  const flags = parseFlags(args.slice(3,),);

  if (flags.priority && !(VALID_PRIORITIES as readonly string[]).includes(flags.priority,)) {
    log("error", `unknown priority '${flags.priority}' — use: ${VALID_PRIORITIES.join(", ",)}`,);
    process.exit(1,);
  }

  const ticketName = kebab(title,);
  const ticketFile = `.plan/tickets/${type}-${ticketName}.md`;
  const extid = `${type}-${ticketName}`;
  const fullTitle = `${extid}: ${title}`;
  const repoRoot = config.repoRoot;
  const ticketPath = resolve(repoRoot, ticketFile,);

  const exists = await Bun.file(ticketPath,).exists();
  if (exists) {
    log("warn", `ticket file already exists: ${ticketFile}`,);
  } else {
    log("info", `creating ticket file: ${ticketFile}`,);

    let content = `# ${type}: ${title}\n\n`;
    content += `**Status:** ⬜ Not Started\n`;
    content += `**Priority:** ${flags.priority || "Medium"}\n`;
    content += `**Effort:** ${flags.effort}\n`;
    if (flags.epic) {
      content += `**Epic:** ${flags.epic}\n`;
    }
    content += `\n## Summary\n\n${body || "No description provided."}\n\n`;
    content += `## Acceptance Criteria\n\n`;
    content += `- [ ] Implementation complete\n`;
    content += `- [ ] Tests passing\n`;
    content += `- [ ] Documentation updated\n`;

    await Bun.write(ticketPath, content,);
    log("success", `created ticket file: ${ticketFile}`,);
  }

  log("info", `creating git issue: ${extid}`,);
  const issueOutput = gitSync(repoRoot, "issue", "create", fullTitle, "-m", body || "No description",);

  const hashMatch = issueOutput.match(/[0-9a-f]{7,40}/,);
  const hash = hashMatch?.[0];

  if (hash) {
    gitSync(repoRoot, "issue", "comment", hash, "-m", `Plan spec: ${ticketFile}`,);
    // Single edit invocation: `git issue edit -l` replaces the whole label set,
    // so per-label edits would leave only the last label applied.
    if (flags.labels.length > 0) {
      gitSync(repoRoot, "issue", "edit", hash, ...flags.labels.flatMap((label,) => ["-l", label,]),);
    }
    if (flags.priority) {
      gitSync(repoRoot, "issue", "edit", hash, "-p", flags.priority,);
    }
    log("success", `created git issue: ${hash}`,);
  } else {
    log("warn", "could not extract issue hash",);
  }

  log("info", `ticket ${extid} created`,);
  console.log(`  File:  ${ticketFile}`,);
  if (hash) { console.log(`  Issue: ${hash}`,); }
}

function parseFlags(args: string[],): TicketFlags {
  const flags: TicketFlags = { labels: [], priority: "", epic: "", effort: "Medium", };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-l":
      case "--label":
        flags.labels.push(...args[++i].split(",",).map((l,) => l.trim()).filter((l,) => l.length > 0),);
        break;
      case "-p":
      case "--priority":
        flags.priority = args[++i];
        break;
      case "-e":
      case "--epic":
        flags.epic = args[++i];
        break;
      case "--effort":
        flags.effort = args[++i];
        break;
    }
  }
  return flags;
}
