<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Mobile App

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** High
**Type:** Feature Epic
**Tags:** mobile, react-native, capacitor, push, camera, deep-linking
**Parent Epic:** Embeddable Engine & 2D/3D Game Frontend (epic-embeddable-engine-game-frontend.md)

## Summary

Mobile wrapper (`loop-lore-mobile/`) for iOS and Android:
React-Native-vs-Capacitor technology decision, responsive UI, push
notifications, camera integration, offline mode with local storage sync,
mobile gestures, store packaging, and deep linking for chat invites.

## Sub-Epic of

Part of the **Embeddable Engine & 2D/3D Game Frontend** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

### Technology Decision

#### React Native

- **Architecture**: React Native CLI or Expo for cross-platform mobile
- **API**: Consumes `@loop-lore/client` + `@loop-lore/react` (shared with web)
- **UI**: React Native components + shared design tokens
- **Native features**: Camera (avatar upload), Push notifications, Offline storage

#### Capacitor

- **Architecture**: Web UI (React/Preact) wrapped in Capacitor
- **API**: Same as web — `@loop-lore/client` + `@loop-lore/react`
- **Native features**: Capacitor plugins for camera, push, filesystem
- **Packaging**: Xcode (iOS), Android Studio (Android)

| Feature      | React Native                | Capacitor                     |
| ------------ | --------------------------- | ----------------------------- |
| Code sharing | Partial (native components) | Full (web UI)                 |
| Performance  | Native                      | WebView                       |
| Development  | React Native CLI/Expo       | Web + Capacitor               |
| App store    | Yes                         | Yes                           |
| Offline      | SQLite/Realm                | IndexedDB + Capacitor Storage |

## Tasks

- [ ] Choose React Native vs Capacitor (recommend Capacitor for code reuse)
- [ ] Create mobile wrapper project (`loop-lore-mobile/`)
- [ ] Implement responsive UI for mobile screens
- [ ] Add push notification support (Firebase Cloud Messaging)
- [ ] Add offline mode with local storage sync
- [ ] Implement camera integration for avatar/asset upload
- [ ] Add mobile-specific gestures (swipe to delete, pull to refresh)
- [ ] Package for iOS (App Store) and Android (Play Store)
- [ ] Add deep linking for chat invites


- [ ] Mobile app (React Native/Capacitor) wrapper
## Dependencies

- Parent hub: **Embeddable Engine & 2D/3D Game Frontend** (`epic-embeddable-engine-game-frontend.md`).
- Siblings: consumes `epic-embeddable-backend.md` (service surface).
- External: **blocked on** `epic-transport-expansion.md` (WS/WT realtime) and `epic-headless-alternative-frontends.md` (headless mode).

## Files

- `loop-lore-mobile/` — mobile app (React Native/Capacitor)
