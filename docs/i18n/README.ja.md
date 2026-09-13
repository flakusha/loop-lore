<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

[![EN](https://img.shields.io/badge/EN-blue)](../../README.md)
[![中文](https://img.shields.io/badge/中文-blue)](README.zh.md)
[![Español](https://img.shields.io/badge/Español-blue)](README.es.md)
[![日本語](https://img.shields.io/badge/日本語-blue)](README.ja.md)
[![한국어](https://img.shields.io/badge/한국어-blue)](README.ko.md)
[![Русский](https://img.shields.io/badge/Русский-blue)](README.ru.md)
[![Français](https://img.shields.io/badge/Français-blue)](README.fr.md)

# loop-lore

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

機能ステータスは [`.plan/epics-index.md`](../../.plan/epics-index.md)、
進行中の作業は [`.plan/backlog/open.md`](../../.plan/backlog/open.md) に
あります — ここでは重複させません。

---

## クイックスタート

```bash
# 前提条件: Bun (https://bun.sh)
bun install
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

- [`docs/README.md`](../../docs/README.md) — ドキュメントハブ (方針、RPG
  ステータス、全体索引)
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
