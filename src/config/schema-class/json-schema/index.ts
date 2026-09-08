// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/index.ts — assemble the full loop-lore config JSON Schema
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
import { frontend, } from "./frontend";
import { federation, } from "./federation";
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

export const jsonSchema = (): JSONSchema => {
  return {
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
  };
};
