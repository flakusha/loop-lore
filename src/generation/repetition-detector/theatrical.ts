// ── Theatrical loop detection ──────────────────────────────

/**
 * Check if text shows signs of theatrical over-performance
 * (excessive emoting, parentheticals, asterisk actions)
 * which can indicate the model is stuck in a loop.
 */
export function detectTheatricalLoop(text: string,): { detected: boolean; score: number } {
  const lines = text.split("\n",);
  if (lines.length < 6) { return { detected: false, score: 0, }; }

  let actionLineCount = 0;
  let _dialogueLineCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { continue; }

    // Lines wrapped in *action* or (action)
    if (
      (trimmed.startsWith("*",) && trimmed.endsWith("*",)) ||
      (trimmed.startsWith("(",) && trimmed.endsWith(")",))
    ) {
      actionLineCount++;
    } else if (trimmed.includes('"',) || trimmed.includes("\u{201C}",) || trimmed.includes("\u{BB}",)) {
      _dialogueLineCount++;
    }
  }

  let nonBlankCount = 0;
  for (const l of lines) { if (l.trim()) { nonBlankCount++; } }
  if (nonBlankCount === 0) { return { detected: false, score: 0, }; }

  const actionRatio = actionLineCount / nonBlankCount;

  // High action ratio with every line being an action suggests loop behavior
  return {
    detected: actionRatio > 0.8 && actionLineCount > 10,
    score: actionRatio,
  };
}
