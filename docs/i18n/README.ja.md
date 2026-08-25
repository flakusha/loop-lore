<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# loop-lore

[![EN](https://img.shields.io/badge/EN-blue)](../../README.md)
[![中文](https://img.shields.io/badge/中文-blue)](README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](README.es.md)
[![日本語](https://img.shields.io/badge/日本語-blue)](README.ja.md)
[![한국어](https://img.shields.io/badge/한국어-blue)](README.ko.md)
[![Русский](https://img.shields.io/badge/Русский-blue)](README.ru.md)
[![Français](https://img.shields.io/badge/Français-blue)](README.fr.md)

**LLM RPG チャット & もっと。**

インスパイア:

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui)

loop-lore は中核機能 — キャラクター、チャット、ワールドブック、マルチバックエンド
LLM — を健全な基盤の上に再構築します:

- **TypeScript + Bun** — コンパイル不要、高速ランタイム
- **データベース駆動** — `bun:sqlite` ローカル、PostgreSQL リモート
  (Kysely クエリビルダー)
- **TUI モード** — blessed ベースのターミナル UI (ブラウザ不要)
- **Web UI** — htmx + Alpine.js (軽量、ビルド不要)
- **アセット** — 画像/音声/動画をあらゆるエンティティに多態的にリンク
- **アシスタント** — ユーザー支援 (提案、ヒント、トラブルシューティング)
- **クリーンなコード** — 小ファイル、厳格な型、12K 行のモノリスなし

システムレイヤー、設計原則、主要な決定事項は
[`docs/spec/architecture.md`](../../docs/spec/architecture.md) を参照して
ください。プロジェクト構造の信頼できる情報源は `src/` と
[`AGENTS.md`](../../AGENTS.md) です — この README のディレクトリ一覧は数日
で古くなります。

---

## 機能

ステータス凡例: **MVP** = 出荷済み、**WIP** = 進行中、**Planned** = 計画済み
だが未着手。仕様リンクは [`docs/spec/`](../../docs/spec/) と
[`docs/frontend/`](../../docs/frontend/) を指します。エピック進捗は
[`.plan/epics-index.md`](../../.plan/epics-index.md)、アクティブな作業は
[`.plan/backlog/open.md`](../../.plan/backlog/open.md) を参照してください。

| 機能                      | ステータス | リファレンス                                                                                                |
| ------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| キャラクター管理          | WIP        | [spec/character-spec](../../docs/spec/character-spec.md)、[frontend/characters](../../docs/frontend/characters.md) |
| チャットエンジン          | WIP        | [spec/messages](../../docs/spec/messages.md)、[frontend/chat](../../docs/frontend/chat/overview.md)          |
| TUI チャット UI           | WIP        | [spec/terminal-ui](../../docs/spec/terminal-ui.md)、[guide/getting-started](../../docs/guide/getting-started.md) |
| データベース層            | WIP        | [spec/schema](../../docs/spec/schema.md)、[spec/db-versioning](../../docs/spec/db-versioning.md)             |
| アセット (メディア)       | WIP        | [spec/assets](../../docs/spec/assets.md)、[frontend/gallery](../../docs/frontend/gallery.md)                |
| アシスタントチャット      | MVP        | [spec/assistant-commands](../../docs/spec/assistant-commands.md)、[frontend/chat/assistant](../../docs/frontend/chat/assistant.md) |
| VN シーン生成             | WIP        | [spec/visual-novel](../../docs/spec/visual-novel.md)、[frontend/chat/visual-novel-mode](../../docs/frontend/chat/visual-novel-mode.md) |
| 感情アバター              | WIP        | _仕様未定 — `.plan/` を参照_                                                                                  |
| 正規表現抽出              | WIP        | _仕様未定 — `src/regex/` を参照_                                                                              |
| RPG システム              | WIP        | [spec/rpg-mechanics](../../docs/spec/rpg-mechanics.md)、[spec/achievements](../../docs/spec/achievements.md) |
| ワールドブック / ワールド情報 | Planned | [spec/lore](../../docs/spec/lore.md)、[frontend/worlds](../../docs/frontend/worlds.md)                     |
| Web UI                    | WIP        | [frontend/component-architecture](../../docs/frontend/component-architecture.md)                            |
| プラグインシステム        | WIP        | [spec/plugin-system](../../docs/spec/plugin-system.md)                                                      |
| 暗号化                    | WIP        | [spec/crypto](../../docs/spec/crypto.md)、[spec/encryption-workflow](../../docs/spec/encryption-workflow.md)、[frontend/encryption](../../docs/frontend/encryption.md) |
| マルチセッション          | WIP        | [spec/users-sessions](../../docs/spec/users-sessions.md)                                                    |
| 国際化 (i18n)             | WIP        | [frontend/internationalization](../../docs/frontend/internationalization.md)、[docs/i18n](../i18n/)        |
| メモリ                    | WIP        | [spec/memory-system](../../docs/spec/memory-system.md)、[frontend/chat/memories](../../docs/frontend/chat/memories.md) |
| テレメトリ                | WIP        | [spec/observability-telemetry](../../docs/spec/observability-telemetry.md)                                  |
| 暴言フィルター            | WIP        | _仕様未定 — `src/profanity/` を参照_                                                                          |
| 年齢ゲート                | WIP        | [frontend/age-gate](../../docs/frontend/age-gate.md)                                                        |
| 通知                      | WIP        | [frontend/notifications](../../docs/frontend/notifications.md)                                              |

---

## 技術スタック

| レイヤー    | 選択                                                                              |
| ----------- | --------------------------------------------------------------------------------- |
| ランタイム  | Bun (高速 TS/JS、ビルド不要)                                                      |
| 言語        | TypeScript 5.4+ (厳格モード)                                                      |
| データベース | `bun:sqlite` → Kysely 方言スワップで Postgres                                     |
| クエリビルダー | Kysely (型安全、ORM オーバーヘッドなし)                                          |
| TUI         | blessed + blessed-contrib                                                         |
| Web UI      | htmx + Alpine.js                                                                  |

アーキテクチャの決定とトレードオフは
[`docs/spec/architecture.md`](../../docs/spec/architecture.md) にあります。
コーディング規約は [`.agents/references/`](../../.agents/references/) を参照して
ください。

---

## クイックスタート

```bash
# 前提条件: Bun (https://bun.sh)
bun install
cp .env.example .env
bun run db:migrate

# Web サーバーを起動
bun run dev

# TUI を起動 (別のターミナルで)
bun run tui

# すべてのチェックを実行 (typecheck + lint + format)
bun run check

# テストを実行
bun test src/
```

完全版ガイド: [`docs/guide/getting-started.md`](../../docs/guide/getting-started.md)。

---

## ドキュメント

- [`docs/spec/`](../../docs/spec/) — 中核仕様 (アーキテクチャ、キャラクター、
  チャット、RPG、暗号化、テレメトリ、…)
- [`docs/frontend/`](../../docs/frontend/) — UX 仕様 (コンポーネント、
  チャット、ギャラリー、キャラクター、…)
- [`docs/guide/`](../../docs/guide/) — ユーザーガイド (インストール、
  初めてのチャット、ギャラリー、キャラクター、ワールド、ペルソナ、設定)
- [`docs/reference/`](../../docs/reference/) — リファレンス (API 仕様)
- [`docs/ideas/`](../../docs/ideas/) — 設計アイデアと提案
- [`docs/meta/`](../../docs/meta/) — リサーチ、評価、レビュー、ワークフロー
- [`docs/i18n/`](../i18n/) — README の翻訳
- [`.plan/`](../../.plan/) — タスク管理 (アクティブな作業の信頼できる情報源)
- [`.agents/references/`](../../.agents/references/) — コーディング規約
  (禁止パターン、推奨事項)
- [`AGENTS.md`](../../AGENTS.md) — エージェント指示とプロジェクト概要

---

## ライセンス

LGPL-3.0-or-later (コアコード)、MIT (ドキュメント)、
Apache-2.0 OR MIT (プラグイン)\
全文は [LICENSE](../../LICENSE) と [LICENSES/](../../LICENSES/) を参照して
ください。
