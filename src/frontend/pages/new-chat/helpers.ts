/** Estimate tokens from content length (~4 chars per token). */
export function estimateTokens(content: string,): number {
  return Math.ceil(content.length / 4,);
}
