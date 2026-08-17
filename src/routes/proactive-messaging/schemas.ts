// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Messaging route schemas and shared helpers.
 */
import { t, } from "elysia";
import type { Config, } from "../../config/schema";
import { getLogger, } from "../../logger";
import type { HandlerOpts, } from "../actor-auth";

/** Route options — database handle plus resolved config for generation. */
export interface ProactiveRouteOpts {
  database: HandlerOpts["database"];
  config: Config;
}

export const R = "/api/proactive-messaging";

const frequencyEnum = t.Union([
  t.Literal("very_frequent",),
  t.Literal("frequent",),
  t.Literal("normal",),
  t.Literal("infrequent",),
],);

const nullableString = t.Union([t.String(), t.Null(),],);
const stringUnknownRecord = t.Record(t.String(), t.Unknown(),);

export const configBody = t.Object({
  frequency: t.Optional(frequencyEnum,),
  quietHoursStart: t.Optional(nullableString,),
  quietHoursEnd: t.Optional(nullableString,),
  enabled: t.Optional(t.Boolean(),),
  configJson: t.Optional(stringUnknownRecord,),
},);

export const chatQuery = t.Object({ chatId: t.String(), },);
export const chatActorQuery = t.Object({ chatId: t.String(), actorId: t.String(), },);

export function logErr(msg: string, err: unknown,): void {
  getLogger().child({ module: "proactive-messaging", },).error(
    msg,
    err instanceof Error ? err : new Error(String(err,),),
  );
}
