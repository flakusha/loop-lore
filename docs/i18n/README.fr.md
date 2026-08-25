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

**Chat RPG avec LLM et plus.**

Inspiré par :

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui)

loop-lore reconstruit le cœur — personnages, chats, lorebooks, LLM
multi-backend — sur des bases saines :

- **TypeScript + Bun** — pas d'étape de compilation, runtime rapide
- **Basé sur une base de données** — `bun:sqlite` en local, PostgreSQL
  à distance (constructeur de requêtes Kysely)
- **Mode TUI** — interface terminal basée sur blessed (pas de navigateur
  requis)
- **Web UI** — htmx + Alpine.js (léger, pas d'étape de build)
- **Ressources** — images/audio/vidéo liées polymorphiquement à toute
  entité
- **Assistant** — aide centrée utilisateur (idées, suggestions,
  résolution de problèmes)
- **Code propre** — petits fichiers, types stricts, pas de monolithes
  de 12K lignes

Les couches du système, les principes de conception et les décisions
clés sont documentés dans [`docs/spec/architecture.md`](../../docs/spec/architecture.md).
La source de référence pour la structure du projet est `src/` et
[`AGENTS.md`](../../AGENTS.md) — les listes de répertoires de ce README
deviendront obsolètes en quelques jours.

---

## Fonctionnalités

Légende des statuts : **MVP** = livré, **WIP** = en cours, **Planned** =
prévu mais non démarré. Les liens de spécification pointent vers
[`docs/spec/`](../../docs/spec/) et [`docs/frontend/`](../../docs/frontend/) ;
la progression des epics est dans [`.plan/epics-index.md`](../../.plan/epics-index.md)
et le travail actif dans [`.plan/backlog/open.md`](../../.plan/backlog/open.md).

| Fonctionnalité                | Statut    | Référence                                                                                                                  |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| Gestion des personnages       | WIP       | [spec/character-spec](../../docs/spec/character-spec.md), [frontend/characters](../../docs/frontend/characters.md)         |
| Moteur de chat                | WIP       | [spec/messages](../../docs/spec/messages.md), [frontend/chat](../../docs/frontend/chat/overview.md)                        |
| Interface TUI chat            | WIP       | [spec/terminal-ui](../../docs/spec/terminal-ui.md), [guide/getting-started](../../docs/guide/getting-started.md)           |
| Couche base de données        | WIP       | [spec/schema](../../docs/spec/schema.md), [spec/db-versioning](../../docs/spec/db-versioning.md)                          |
| Ressources (média)            | WIP       | [spec/assets](../../docs/spec/assets.md), [frontend/gallery](../../docs/frontend/gallery.md)                               |
| Chat assistant                | MVP       | [spec/assistant-commands](../../docs/spec/assistant-commands.md), [frontend/chat/assistant](../../docs/frontend/chat/assistant.md) |
| Génération de scènes VN       | WIP       | [spec/visual-novel](../../docs/spec/visual-novel.md), [frontend/chat/visual-novel-mode](../../docs/frontend/chat/visual-novel-mode.md) |
| Avatars émotionnels           | WIP       | _spécification en cours — voir `.plan/`_                                                                                    |
| Extraction regex              | WIP       | _spécification en cours — voir `src/regex/`_                                                                                |
| Systèmes RPG                  | WIP       | [spec/rpg-mechanics](../../docs/spec/rpg-mechanics.md), [spec/achievements](../../docs/spec/achievements.md)             |
| Lorebooks / info monde        | Planned   | [spec/lore](../../docs/spec/lore.md), [frontend/worlds](../../docs/frontend/worlds.md)                                      |
| Web UI                        | WIP       | [frontend/component-architecture](../../docs/frontend/component-architecture.md)                                          |
| Système de plugins            | WIP       | [spec/plugin-system](../../docs/spec/plugin-system.md)                                                                      |
| Cryptographie / chiffrement   | WIP       | [spec/crypto](../../docs/spec/crypto.md), [spec/encryption-workflow](../../docs/spec/encryption-workflow.md), [frontend/encryption](../../docs/frontend/encryption.md) |
| Multi-session                 | WIP       | [spec/users-sessions](../../docs/spec/users-sessions.md)                                                                    |
| i18n                          | WIP       | [frontend/internationalization](../../docs/frontend/internationalization.md), [docs/i18n](../i18n/)                        |
| Mémoire                       | WIP       | [spec/memory-system](../../docs/spec/memory-system.md), [frontend/chat/memories](../../docs/frontend/chat/memories.md)     |
| Télémétrie                    | WIP       | [spec/observability-telemetry](../../docs/spec/observability-telemetry.md)                                                  |
| Filtre de grossièretés        | WIP       | _spécification en cours — voir `src/profanity/`_                                                                            |
| Contrôle d'âge                | WIP       | [frontend/age-gate](../../docs/frontend/age-gate.md)                                                                        |
| Notifications                 | WIP       | [frontend/notifications](../../docs/frontend/notifications.md)                                                              |

---

## Stack technique

| Couche          | Choix                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| Runtime         | Bun (TS/JS rapide, pas d'étape de build)                                             |
| Langage         | TypeScript 5.4+ (mode strict)                                                        |
| Base de données | `bun:sqlite` → Postgres via changement de dialecte Kysely                            |
| Constructeur de requêtes | Kysely (typé sûr, sans surcharge ORM)                                       |
| TUI             | blessed + blessed-contrib                                                            |
| Web UI          | htmx + Alpine.js                                                                     |

Les décisions d'architecture et compromis sont dans
[`docs/spec/architecture.md`](../../docs/spec/architecture.md). Les conventions
de code sont dans [`.agents/references/`](../../.agents/references/).

---

## Démarrage rapide

```bash
# Prérequis : Bun (https://bun.sh)
bun install
cp .env.example .env
bun run db:migrate

# Démarrer le serveur web
bun run dev

# Démarrer la TUI (terminal séparé)
bun run tui

# Lancer toutes les vérifications (typecheck + lint + format)
bun run check

# Lancer les tests
bun test src/
```

Guide complet : [`docs/guide/getting-started.md`](../../docs/guide/getting-started.md).

---

## Documentation

- [`docs/spec/`](../../docs/spec/) — Spécifications du cœur (architecture,
  personnages, chat, RPG, chiffrement, télémétrie, …)
- [`docs/frontend/`](../../docs/frontend/) — Spécifications UX
  (composants, chat, galerie, personnages, …)
- [`docs/guide/`](../../docs/guide/) — Guides utilisateur (installation,
  premier chat, galerie, personnages, mondes, personas, paramètres)
- [`docs/reference/`](../../docs/reference/) — Documentation de référence
  (surface API)
- [`docs/ideas/`](../../docs/ideas/) — Idées et propositions de conception
- [`docs/meta/`](../../docs/meta/) — Recherche, évaluations, revues,
  workflow
- [`docs/i18n/`](../i18n/) — Traductions localisées du README
- [`.plan/`](../../.plan/) — Suivi des tâches (source de vérité du
  travail actif)
- [`.agents/references/`](../../.agents/references/) — Conventions de code
  (motifs interdits, recommandations)
- [`AGENTS.md`](../../AGENTS.md) — Instructions pour les agents et vue
  d'ensemble du projet

---

## Licence

LGPL-3.0-or-later (code principal), MIT (documentation),
Apache-2.0 OR MIT (plugins)\
Voir [LICENSE](../../LICENSE) et [LICENSES/](../../LICENSES/) pour les
textes complets.
