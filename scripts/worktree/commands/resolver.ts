// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { gitSync, } from "../utils/git";

export interface ResolvedIssue {
  hash: string;
  raw: string;
}

export function resolveExtid(repoRoot: string, input: string,): ResolvedIssue | null {
  const extidPattern = /^[A-Z]+-[A-Z0-9-]+$/;
  if (!extidPattern.test(input,)) {
    return { hash: input, raw: input, };
  }

  const lines = gitSync(repoRoot, "issue", "ls",).split("\n",);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { continue; }

    const match = trimmed.match(/([0-9a-f]{7,40})\s+/,);
    const hash = match?.[1];
    if (hash && trimmed.includes(input,)) {
      return { hash, raw: trimmed, };
    }
  }

  return null;
}
