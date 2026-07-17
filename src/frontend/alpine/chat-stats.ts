export function formattedGenerationTime(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function formattedTokensPerSecond(msg: {
  tokens_per_second?: number;
  generation_time_ms?: number;
  token_count_total?: number;
}): string {
  if (msg.tokens_per_second != null) return `${msg.tokens_per_second.toFixed(1)} t/s`;
  if (msg.generation_time_ms && msg.token_count_total) {
    const tps = msg.token_count_total / (msg.generation_time_ms / 1000);
    return `${tps.toFixed(1)} t/s`;
  }
  return "";
}

export function statsLine(msg: {
  model_id?: string;
  provider?: string;
  generation_time_ms?: number;
  token_count_total?: number;
  tokens_per_second?: number;
}): string {
  const parts: string[] = [];
  if (msg.model_id) parts.push(msg.model_id);
  if (msg.provider) parts.push(msg.provider);
  if (msg.generation_time_ms) parts.push(formattedGenerationTime(msg.generation_time_ms));
  if (msg.token_count_total != null) parts.push(`${msg.token_count_total}t`);
  const tps = formattedTokensPerSecond(msg);
  if (tps) parts.push(tps);
  return parts.join(" \u{B7} ");
}
