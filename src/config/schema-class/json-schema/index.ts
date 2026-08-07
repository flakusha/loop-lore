// src/config/schema-class/json-schema/index.ts — assemble the full loop-lore config JSON Schema
import { ageGate, } from "./ageGate";
import { assets, } from "./assets";
import { assistant, } from "./assistant";
import { auth, } from "./auth";
import { byoKey, } from "./byoKey";
import { db, } from "./db";
import { docs, } from "./docs";
import { dynamicResponse, } from "./dynamicResponse";
import { generation, } from "./generation";
import { headers, } from "./headers";
import { hooks, } from "./hooks";
import { logging, } from "./logging";
import { messages, } from "./messages";
import { nsfw, } from "./nsfw";
import { server, } from "./server";
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
      hooks,
      generation,
      byoKey,
      headers,
      dynamicResponse,
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
    ],
  };
};
