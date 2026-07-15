export interface ScorerContext {
  response: string;
  prompt: string;
  actorName: string;
  lore: string | null;
  quests: { name: string; progress: number; target: number }[];
  recentTurns: { response: string | null }[];
}

export type Scorer = (ctx: ScorerContext) => number;
