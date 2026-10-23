#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * bin/lolo.ts — Loop Lore CLI: headless subcommands + TUI fallback.
 *
 * Headless (planned-new per TASK-headless-cli-chat-generate /
 * TASK-headless-cli-assets-characters):
 *   lolo chat create|send|history, lolo generate [--stream],
 *   lolo assets upload|link, lolo characters create|import.
 * No subcommand (or `-h`) keeps the legacy behavior: launch the TUI via
 * {@link createTUIApp}. `--json` prints a parseable `{ data }` / `{ error }`
 * envelope and exits non-zero on API error; without it output is a
 * human-readable table. Auth mirrors the TUI: Bearer `[tui].sessionToken`
 * (via `--token` or `config.tui.sessionToken`), base URL from
 * `LOOP_LORE_API_BASE_URL` (default `http://localhost:3000`).
 */

import { randomUUID, } from "node:crypto";
import {
  headlessAssetLink,
  headlessAssetUpload,
  headlessCharacterCreate,
  headlessCharacterImport,
  headlessChatCreate,
  headlessChatHistory,
  headlessChatSend,
  headlessGenerate,
  headlessGenerateStream,
  type HeadlessResult,
} from "../src/cli/headless";
import { loadConfig, } from "../src/config/load";
import { createTUIApp, } from "../src/tui/app";
import { jsonStringifyOr, } from "../src/utils";

const COMMANDS: Record<string, true> = { chat: true, generate: true, assets: true, characters: true, };

const HELP_TEXT = `lolo — Loop Lore CLI (headless subcommands + TUI)

Usage: lolo [options] [command]

Headless:
  chat create --name N [--json]
  chat send <chatId> -m TEXT [--idempotency-key K] [--asset <assetId>...] [--json]
  chat history <chatId> [--page N] [--page-size N] [--json]
  generate --chat-id C --parent P --actor A [--prompt P] [--idempotency-key K]
             [--provider P] [--model M] [--temperature T] [--max-tokens N] [--stream] [--json]
  assets upload <file> [--alt-text T] [--json]
  assets link <assetId> --chat <chatId> [--json]
  characters create --display-name N [--description D] [--personality P]
                    [--appearance A] [--scenario S] [--system-prompt S]
                    [--avatar <assetId>] [--json]
  characters import <card.png|json|charx> [--json]

Options:
  -h, --help    Show this help text and exit

TUI (no subcommand):
  F1            Chat picker
  F2            Toggle asset sidebar
  F3            Toggle harness panel
  F5            Reload / re-render
  F6            Models overlay
  Ctrl+L        Clear screen
  Esc / q       Quit

Environment:
  LOOP_LORE_API_BASE_URL   API base URL (default: http://localhost:3000)
`;

/** Parsed global flags shared by every subcommand. */
interface GlobalFlags {
  help: boolean;
  json: boolean;
  token: string | undefined;
  rest: string[];
}

function parseGlobal(argv: string[],): GlobalFlags {
  const help = argv.includes("--help",) || argv.includes("-h",);
  const json = argv.includes("--json",);
  const tokenIdx = argv.findIndex((a,) => a === "--token");
  const token = tokenIdx >= 0 && tokenIdx + 1 < argv.length ? argv[tokenIdx + 1] : undefined;
  let rest = argv.filter((a,) => a !== "--json" && a !== "--help" && a !== "-h");
  if (tokenIdx >= 0) {
    rest = [...rest.slice(0, rest.indexOf("--token",),), ...rest.slice(rest.indexOf("--token",) + 2,),];
  }

  return { help, json, token, rest, };
}

function resolveToken(cliToken: string | undefined,): string | undefined {
  if (cliToken) { return cliToken; }
  try {
    const token = loadConfig().tui.sessionToken;
    return token === "" ? undefined : token;
  } catch {
    return undefined;
  }
}

function takeValue(args: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const eq = args.find((a,) => a.startsWith(`${name}=`,));
    if (eq) { return eq.slice(name.length + 1,); }
    const idx = args.indexOf(name,);
    if (idx >= 0 && idx + 1 < args.length) { return args[idx + 1]; }
  }

  return undefined;
}

function takeAll(args: string[], ...names: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const eqName = names.find((n,) => arg.startsWith(`${n}=`,));
    if (eqName) {
      out.push(arg.slice(eqName.length + 1,),);
      continue;
    }

    if (names.includes(arg,) && i + 1 < args.length) {
      out.push(args[i + 1]!,);
      i++;
    }
  }

  return out;
}

function positional(args: string[],): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("-",)) {
      if (arg.includes("=",)) { continue; }
      i++;
      continue;
    }

    out.push(arg,);
  }

  return out;
}

function emit(json: boolean, result: HeadlessResult<unknown>,): never {
  if (json) {
    process.stdout.write(`${jsonStringifyOr(result.ok ? { data: result.data, } : { error: result.error, },)}\n`,);
    process.exit(result.ok ? 0 : 1,);
  }

  if (!result.ok) {
    process.stderr.write(`error: ${result.error}\n`,);
    process.exit(1,);
  }

  process.stdout.write(`${formatHuman(result.data,)}\n`,);
  process.exit(0,);
}

function formatHuman(data: unknown,): string {
  if (typeof data === "string") { return data; }
  if (data !== null && typeof data === "object" && !Array.isArray(data,)) {
    const entries = Object.entries(data as Record<string, unknown>,);
    if (entries.length > 0 && entries.every(([, v,],) => typeof v !== "object" || v === null)) {
      return entries.map(([k, v,],) => `${k}: ${String(v ?? "",)}`).join("\n",);
    }
  }

  return jsonStringifyOr(data, "null",);
}

async function runChat(args: string[], flags: GlobalFlags, token: string | undefined,): Promise<never> {
  const [sub, ...restArgs] = args;
  if (sub === "create") {
    const name = takeValue(restArgs, "--name", "-n",) ?? "untitled";
    emit(flags.json, await headlessChatCreate(name, token,),);
  }

  if (sub === "send") {
    const [chatId,] = positional(restArgs,);
    const content = takeValue(restArgs, "--message", "-m",);
    if (!chatId || !content) {
      process.stderr.write("usage: lolo chat send <chatId> -m TEXT\n",);
      process.exit(2,);
    }

    const idempotencyKey = takeValue(restArgs, "--idempotency-key",);
    const assetIds = takeAll(restArgs, "--asset",);
    emit(
      flags.json,
      await headlessChatSend(chatId, content, token, {
        ...(idempotencyKey ? { idempotencyKey, } : {}),
        ...(assetIds.length > 0 ? { attachments: assetIds.map((assetId,) => ({ assetId, })), } : {}),
      },),
    );
  }

  if (sub === "history") {
    const [chatId,] = positional(restArgs,);
    if (!chatId) {
      process.stderr.write("usage: lolo chat history <chatId>\n",);
      process.exit(2,);
    }

    const page = Number(takeValue(restArgs, "--page",) ?? "1",);
    const pageSize = Number(takeValue(restArgs, "--page-size",) ?? "20",);
    emit(flags.json, await headlessChatHistory(chatId, token, page, pageSize,),);
  }

  process.stderr.write("usage: lolo chat create|send|history\n",);
  process.exit(2,);
}

async function runGenerate(args: string[], flags: GlobalFlags, token: string | undefined,): Promise<never> {
  const chatId = takeValue(args, "--chat-id",);
  const parent = takeValue(args, "--parent",);
  const actor = takeValue(args, "--actor",);
  if (!chatId || !parent || !actor) {
    process.stderr.write("usage: lolo generate --chat-id C --parent P --actor A\n",);
    process.exit(2,);
  }

  if (args.includes("--stream",)) {
    const result = await headlessGenerateStream(chatId, token,);
    if (!result.ok) { emit(flags.json, result,); }
    if (flags.json) {
      process.stdout.write(`${jsonStringifyOr({ data: result.data, },)}\n`,);
    } else {
      process.stdout.write(`${result.data.text}\n`,);
    }

    process.exit(0,);
  }

  const prompt = takeValue(args, "--prompt", "-p",);
  const idempotencyKey = takeValue(args, "--idempotency-key",) ?? randomUUID();
  const provider = takeValue(args, "--provider",);
  const modelId = takeValue(args, "--model",);
  const temperatureRaw = takeValue(args, "--temperature",);
  const maxTokensRaw = takeValue(args, "--max-tokens",);
  emit(
    flags.json,
    await headlessGenerate({
      chatId,
      parentMessageId: parent,
      actorId: actor,
      idempotencyKey,
      stream: false,
      ...(prompt ? { prompt: [{ role: "user" as const, content: prompt, },], } : {}),
      ...(provider ? { provider, } : {}),
      ...(modelId ? { modelId, } : {}),
      ...(temperatureRaw !== undefined ? { temperature: Number(temperatureRaw,), } : {}),
      ...(maxTokensRaw !== undefined ? { maxTokens: Number(maxTokensRaw,), } : {}),
    }, token,),
  );
}

async function runAssets(args: string[], flags: GlobalFlags, token: string | undefined,): Promise<never> {
  const [sub, ...restArgs] = args;
  if (sub === "upload") {
    const [file,] = positional(restArgs,);
    if (!file) {
      process.stderr.write("usage: lolo assets upload <file>\n",);
      process.exit(2,);
    }

    const altText = takeValue(restArgs, "--alt-text",);
    emit(flags.json, await headlessAssetUpload(file, token, altText,),);
  }

  if (sub === "link") {
    const [assetId,] = positional(restArgs,);
    const chatId = takeValue(restArgs, "--chat",);
    if (!assetId || !chatId) {
      process.stderr.write("usage: lolo assets link <assetId> --chat <chatId>\n",);
      process.exit(2,);
    }

    emit(flags.json, await headlessAssetLink(assetId, chatId, token,),);
  }

  process.stderr.write("usage: lolo assets upload|link\n",);
  process.exit(2,);
}

function fieldOpts(args: string[],): Record<string, string> {
  const out: Record<string, string> = {};
  const pairs: [string, string,][] = [
    ["--description", "description",],
    ["--personality", "personality",],
    ["--appearance", "appearance",],
    ["--scenario", "scenario",],
    ["--system-prompt", "systemPrompt",],
    ["--avatar", "assetId",],
  ];

  for (const [flagName, key,] of pairs) {
    const value = takeValue(args, flagName,);
    if (value !== undefined) { out[key] = value; }
  }

  return out;
}

async function runCharacters(args: string[], flags: GlobalFlags, token: string | undefined,): Promise<never> {
  const [sub, ...restArgs] = args;
  if (sub === "create") {
    const displayName = takeValue(restArgs, "--display-name",);
    if (!displayName) {
      process.stderr.write("usage: lolo characters create --display-name N\n",);
      process.exit(2,);
    }

    emit(
      flags.json,
      await headlessCharacterCreate({
        displayName,
        ...fieldOpts(restArgs,),
      }, token,),
    );
  }

  if (sub === "import") {
    const [file,] = positional(restArgs,);
    if (!file) {
      process.stderr.write("usage: lolo characters import <card.png|json|charx>\n",);
      process.exit(2,);
    }

    emit(flags.json, await headlessCharacterImport(file, token,),);
  }

  process.stderr.write("usage: lolo characters create|import\n",);
  process.exit(2,);
}

async function main(): Promise<void> {
  const argv = Bun.argv.slice(2,);
  const flags = parseGlobal(argv,);
  if (flags.help && (flags.rest.length === 0 || !COMMANDS[flags.rest[0]!])) {
    process.stdout.write(HELP_TEXT,);
    process.exit(0,);
  }

  const [command, ...rest] = flags.rest;
  if (!command || !COMMANDS[command]) {
    if (flags.rest.length > 0 && (flags.json || flags.token !== undefined)) {
      process.stderr.write(`unknown command: ${flags.rest[0]}\n`,);
      process.exit(2,);
    }

    // Legacy behavior: no subcommand boots the terminal UI.
    createTUIApp();
    return;
  }

  const token = resolveToken(flags.token,);
  if (command === "chat") { await runChat(rest, flags, token,); }
  else if (command === "generate") { await runGenerate(rest, flags, token,); }
  else if (command === "assets") { await runAssets(rest, flags, token,); }
  else { await runCharacters(rest, flags, token,); }
}

// Entry-point guard — inert on import; subcommand dispatch and TUI boot
// only run when executed directly (bun run bin/lolo.ts or installed bin/lolo).
if (import.meta.main) {
  await main();
}
