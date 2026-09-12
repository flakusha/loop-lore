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

L'état des fonctionnalités vit dans
[`.plan/epics-index.md`](../../.plan/epics-index.md) et le travail actif dans
[`.plan/backlog/open.md`](../../.plan/backlog/open.md) — les statuts ne sont
pas dupliqués ici.

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

- [`docs/README.md`](../../docs/README.md) — Hub de documentation
  (philosophie, état RPG, index complet)
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
