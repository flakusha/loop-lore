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

**LLM RPG 채팅 그리고 그 이상.**

영감을 받은 프로젝트:

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)
- [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus)
- [Open WebUI](https://github.com/open-webui/open-webui)

loop-lore 는 핵심 기능 — 캐릭터, 채팅, 로어북, 멀티 백엔드 LLM — 을 견고한
기반 위에 재구축합니다:

- **TypeScript + Bun** — 컴파일 단계 없음, 빠른 런타임
- **데이터베이스 기반** — `bun:sqlite` 로컬, PostgreSQL 원격
  (Kysely 쿼리 빌더)
- **TUI 모드** — blessed 기반 터미널 인터페이스 (브라우저 불필요)
- **Web UI** — htmx + Alpine.js (경량, 빌드 단계 없음)
- **에셋** — 이미지/오디오/비디오를 임의의 엔티티에 다형적으로 연결
- **어시스턴트** — 사용자 중심 도움말 (아이디어, 제안, 문제 해결)
- **깔끔한 코드** — 작은 파일, 엄격한 타입, 12K 줄짜리 모놀리스 없음

시스템 계층, 설계 원칙, 핵심 결정 사항은
[`docs/spec/architecture.md`](../../docs/spec/architecture.md) 을 참조하세요.
프로젝트 구조의 권위 있는 출처는 `src/` 와 [`AGENTS.md`](../../AGENTS.md) 입니다
— 이 README 의 디렉터리 목록은 며칠 내에 오래됩니다.

---

## 기능

상태 범례: **MVP** = 출시됨, **WIP** = 진행 중, **Planned** = 계획되었으나
미착수. 명세 링크는 [`docs/spec/`](../../docs/spec/) 과
[`docs/frontend/`](../../docs/frontend/) 을 가리킵니다. 에픽 진행 상황은
[`.plan/epics-index.md`](../../.plan/epics-index.md), 진행 중인 작업은
[`.plan/backlog/open.md`](../../.plan/backlog/open.md) 에서 확인하세요.

| 기능                  | 상태     | 참조                                                                                                            |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| 캐릭터 관리           | WIP      | [spec/character-spec](../../docs/spec/character-spec.md), [frontend/characters](../../docs/frontend/characters.md) |
| 채팅 엔진             | WIP      | [spec/messages](../../docs/spec/messages.md), [frontend/chat](../../docs/frontend/chat/overview.md)              |
| TUI 채팅 인터페이스   | WIP      | [spec/terminal-ui](../../docs/spec/terminal-ui.md), [guide/getting-started](../../docs/guide/getting-started.md) |
| 데이터베이스 계층     | WIP      | [spec/schema](../../docs/spec/schema.md), [spec/db-versioning](../../docs/spec/db-versioning.md)                  |
| 에셋 (미디어)         | WIP      | [spec/assets](../../docs/spec/assets.md), [frontend/gallery](../../docs/frontend/gallery.md)                     |
| 어시스턴트 채팅       | MVP      | [spec/assistant-commands](../../docs/spec/assistant-commands.md), [frontend/chat/assistant](../../docs/frontend/chat/assistant.md) |
| VN 장면 생성          | WIP      | [spec/visual-novel](../../docs/spec/visual-novel.md), [frontend/chat/visual-novel-mode](../../docs/frontend/chat/visual-novel-mode.md) |
| 감정 아바타           | WIP      | _명세 미정 — `.plan/` 참조_                                                                                       |
| 정규식 추출           | WIP      | _명세 미정 — `src/regex/` 참조_                                                                                   |
| RPG 시스템            | WIP      | [spec/rpg-mechanics](../../docs/spec/rpg-mechanics.md), [spec/achievements](../../docs/spec/achievements.md)     |
| 로어북 / 월드 정보    | Planned  | [spec/lore](../../docs/spec/lore.md), [frontend/worlds](../../docs/frontend/worlds.md)                          |
| Web UI                | WIP      | [frontend/component-architecture](../../docs/frontend/component-architecture.md)                                |
| 플러그인 시스템       | WIP      | [spec/plugin-system](../../docs/spec/plugin-system.md)                                                          |
| 암호화                | WIP      | [spec/crypto](../../docs/spec/crypto.md), [spec/encryption-workflow](../../docs/spec/encryption-workflow.md), [frontend/encryption](../../docs/frontend/encryption.md) |
| 멀티 세션             | WIP      | [spec/users-sessions](../../docs/spec/users-sessions.md)                                                        |
| i18n                  | WIP      | [frontend/internationalization](../../docs/frontend/internationalization.md), [docs/i18n](../i18n/)            |
| 메모리                | WIP      | [spec/memory-system](../../docs/spec/memory-system.md), [frontend/chat/memories](../../docs/frontend/chat/memories.md) |
| 텔레메트리            | WIP      | [spec/observability-telemetry](../../docs/spec/observability-telemetry.md)                                      |
| 비속어 필터           | WIP      | _명세 미정 — `src/profanity/` 참조_                                                                              |
| 연령 게이트           | WIP      | [frontend/age-gate](../../docs/frontend/age-gate.md)                                                            |
| 알림                  | WIP      | [frontend/notifications](../../docs/frontend/notifications.md)                                                  |

---

## 기술 스택

| 계층           | 선택                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| 런타임         | Bun (빠른 TS/JS, 빌드 단계 없음)                                                  |
| 언어           | TypeScript 5.4+ (엄격 모드)                                                       |
| 데이터베이스   | `bun:sqlite` → Kysely 방언 스왑으로 Postgres                                      |
| 쿼리 빌더      | Kysely (타입 안전, ORM 오버헤드 없음)                                             |
| TUI            | blessed + blessed-contrib                                                         |
| Web UI         | htmx + Alpine.js                                                                  |

아키텍처 결정과 트레이드오프는
[`docs/spec/architecture.md`](../../docs/spec/architecture.md) 에 있습니다.
코딩 규칙은 [`.agents/references/`](../../.agents/references/) 을 참조하세요.

---

## 빠른 시작

```bash
# 사전 요구 사항: Bun (https://bun.sh)
bun install
cp .env.example .env
bun run db:migrate

# 웹 서버 시작
bun run dev

# TUI 시작 (별도 터미널에서)
bun run tui

# 모든 검사 실행 (typecheck + lint + format)
bun run check

# 테스트 실행
bun test src/
```

전체 가이드: [`docs/guide/getting-started.md`](../../docs/guide/getting-started.md).

---

## 문서

- [`docs/spec/`](../../docs/spec/) — 핵심 명세 (아키텍처, 캐릭터, 채팅,
  RPG, 암호화, 텔레메트리, …)
- [`docs/frontend/`](../../docs/frontend/) — UX 명세 (컴포넌트, 채팅,
  갤러리, 캐릭터, …)
- [`docs/guide/`](../../docs/guide/) — 사용자 가이드 (설치, 첫 채팅,
  갤러리, 캐릭터, 월드, 페르소나, 설정)
- [`docs/reference/`](../../docs/reference/) — 참조 문서 (API 표면)
- [`docs/ideas/`](../../docs/ideas/) — 설계 아이디어와 제안
- [`docs/meta/`](../../docs/meta/) — 연구, 평가, 리뷰, 워크플로
- [`docs/i18n/`](../i18n/) — README 번역
- [`.plan/`](../../.plan/) — 작업 추적 (진행 중인 작업의 권위 있는 출처)
- [`.agents/references/`](../../.agents/references/) — 코딩 규칙
  (금지 패턴, 권장 사항)
- [`AGENTS.md`](../../AGENTS.md) — 에이전트 지침과 프로젝트 개요

---

## 라이선스

LGPL-3.0-or-later (핵심 코드), MIT (문서), Apache-2.0 OR MIT (플러그인)\
전체 텍스트는 [LICENSE](../../LICENSE) 와 [LICENSES/](../../LICENSES/) 을
참조하세요.
