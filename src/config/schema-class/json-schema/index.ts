// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/index.ts — assemble the full loop-lore config JSON Schema
import { DATA_DIR, } from "../../constants";
import { ageGate, } from "./age-gate";
import { assets, } from "./assets";
import { assistant, } from "./assistant";
import { auth, } from "./auth";
import { byoKey, } from "./byo-key";
import { characters, } from "./characters";
import { cron, } from "./cron";
import { db, } from "./db";
import { docs, } from "./docs";
import { dynamicResponse, } from "./dynamic-response";
import { encryption, } from "./encryption";
import { federation, } from "./federation";
import { frontend, } from "./frontend";
import { generation, } from "./generation";
import { headers, } from "./headers";
import { hooks, } from "./hooks";
import { idempotency, } from "./idempotency";
import { logging, } from "./logging";
import { messages, } from "./messages";
import { nsfw, } from "./nsfw";
import { observability, } from "./observability";
import { seeding, } from "./seeding";
import { server, } from "./server";
import { templates, } from "./templates";
import { transport, } from "./transport";
import { tui, } from "./tui";
type JSONSchema = Record<string, unknown>;

/**
 * Rewrite resolved DATA_DIR-anchored path defaults back to portable
 * `${DATA_DIR}` placeholders so the published schema is stable across
 * dev checkouts / worktrees / CI machines. Section Metas carry the
 * @param node
 * @returns Node with paths rewritten to placeholders.
 */
const toPlaceholders = (node: unknown,): unknown => {
  if (typeof node === "string") {
    return node.startsWith(DATA_DIR,) ? node.replace(DATA_DIR, "${DATA_DIR}",) : node;
  }
  if (Array.isArray(node,)) { return node.map(toPlaceholders,); }
  if (node !== null && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>,).map(([k, v,],) => [k, toPlaceholders(v,),]),
    );
  }
  return node;
};

export const jsonSchema = (): JSONSchema => {
  return toPlaceholders({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "./schemas/loop-lore-config.schema.json",
    title: "loop-lore Config",
    type: "object",
    properties: {
      server,
      db,
      assets,
      assistant,
      logging,
      tui,
      docs,
      ageGate,
      auth,
      transport,
      messages,
      nsfw,
      observability,
      hooks,
      idempotency,
      generation,
      byoKey,
      encryption,
      headers,
      dynamicResponse,
      frontend,
      federation,
      seeding,
      templates,
      characters,
      cron,
    },
    required: [
      "server",
      "db",
      "assets",
      "assistant",
      "logging",
      "tui",
      "docs",
      "auth",
      "transport",
      "messages",
      "encryption",
      "headers",
      "dynamicResponse",
      "frontend",
      "seeding",
      "templates",
      "characters",
    ],
  },) as JSONSchema;
};
