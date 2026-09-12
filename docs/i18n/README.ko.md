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

기능 상태는 [`.plan/epics-index.md`](../../.plan/epics-index.md), 진행 중인
작업은 [`.plan/backlog/open.md`](../../.plan/backlog/open.md) 에 있습니다 —
상태는 여기에 중복하지 않습니다.

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

- [`docs/README.md`](../../docs/README.md) — 문서 허브 (방침, RPG 상태,
  전체 색인)
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
