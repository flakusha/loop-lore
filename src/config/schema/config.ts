// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/config.ts — Top-level Config aggregation
//
// Aggregates every config section. Imports sibling domain types to avoid
// circular dependencies.

import type { TemplatesConfig, } from "../sections/templates";

import type { AgeGateConfig, } from "./age-gate";
import type { AssetsConfig, } from "./assets";
import type { AssistantConfig, } from "./assistant";
import type { AuthConfig, } from "./auth";
import type { ByoKeyConfig, } from "./byo-key";
import type { CharactersConfig, } from "./characters";
import type { DbConfig, } from "./db";
import type { DocumentationConfig, } from "./docs";
import type { DynamicResponseConfig, } from "./dynamic-response";
import type { EncryptionConfig, } from "./encryption";
import type { FrontendConfig, } from "./frontend";
import type { GenerationConfig, } from "./generation";
import type { HeadersConfig, } from "./headers";
import type { HooksConfig, } from "./hooks";
import type { IdempotencyConfig, } from "./idempotency";
import type { LoggingConfig, } from "./logging";
import type { MessagesConfig, } from "./messages";
import type { NsfwConfig, } from "./nsfw";
import type { SeedingConfig, } from "./seeding";
import type { ServerConfig, } from "./server";
import type { TestingConfig, } from "./testing";
import type { TransportConfig, } from "./transport";
import type { TuiConfig, } from "./tui";

export interface Config {
  server: ServerConfig;
  db: DbConfig;
  assets: AssetsConfig;
  assistant: AssistantConfig;
  logging: LoggingConfig;
  tui: TuiConfig;
  docs: DocumentationConfig;
  ageGate: AgeGateConfig;
  auth: AuthConfig;
  transport: TransportConfig;
  messages: MessagesConfig;
  idempotency: IdempotencyConfig;
  nsfw: NsfwConfig;
  hooks: HooksConfig;
  generation: GenerationConfig;
  byoKey: ByoKeyConfig;
  encryption: EncryptionConfig;
  headers: HeadersConfig;
  seeding: SeedingConfig;
  dynamicResponse: DynamicResponseConfig;
  templates: TemplatesConfig;
  characters: CharactersConfig;
  testing?: TestingConfig;
  frontend: FrontendConfig;
}
