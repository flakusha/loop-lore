import { log, } from "./log.js";
import type { RpgServiceDeps, } from "./types.js";

export interface LogXpParams {
  actorId: string;
  amount: number;
  source: string;
  description?: string;
  referenceId?: string;
  chatId?: string;
}

export async function logXp(
  deps: RpgServiceDeps,
  params: LogXpParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("xp_ledger",)
    .values({
      id,
      actor_id: params.actorId,
      amount: params.amount,
      source: params.source,
      description: params.description ?? null,
      reference_id: params.referenceId ?? null,
      chat_id: params.chatId ?? null,
    },)
    .execute();

  log().debug("Logged XP", { id, actorId: params.actorId, amount: params.amount, },);
  return id;
}

export async function getXpHistory(
  deps: RpgServiceDeps,
  actorId: string,
  limit = 50,
): Promise<
  {
    id: string;
    amount: number;
    source: string;
    description: string | null;
    createdAt: string;
  }[]
> {
  const { database, } = deps;

  const rows = await database
    .selectFrom("xp_ledger",)
    .where("actor_id", "=", actorId,)
    .select([
      "id",
      "amount",
      "source",
      "description",
      "created_at",
    ],)
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .execute();
  return Array.from(rows, (r,) => ({
    id: r.id,
    amount: r.amount,
    source: r.source,
    description: r.description,
    createdAt: r.created_at,
  }),);
}
