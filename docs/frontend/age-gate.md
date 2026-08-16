<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Frontend: Age Gate

**URL**: `/age-gate` (redirect target from login when age gate is enabled)

## Overview

Age verification / compliance page. When the server has `ageGate.enabled=true`, users who
haven't yet accepted the age gate are redirected here after login (or on first solo session).
When the gate is disabled, this page is never shown — the user goes straight to `/`.

This follows the principle of **progressive disclosure**: the gate is invisible when not
needed, and straightforward when it is.

## When It Shows

| Condition                                                | Behaviour                              |
| -------------------------------------------------------- | -------------------------------------- |
| `ageGate.enabled=false`                                  | Never shown. No redirect. No friction. |
| `ageGate.mode="none"`                                    | Same as disabled — never shown.        |
| `ageGate.mode="self-declaration"`, gate not yet accepted | Redirect to `/age-gate` after login    |
| `ageGate.mode="self-declaration"`, gate already accepted | No redirect — proceed to `/`           |
| Demo/solo mode, gate enabled, not accepted               | Redirect to `/age-gate` on first visit |

## Layout

Centered card on the same dark background as the login page. Max-width 440px.
Vertically and horizontally centered. No sidebar, no navigation.

## Card Contents

- Application logo/name (same as login page, 24px)
- A brief heading: **"Age Verification"**
- Explanatory text: _"To use this service, you must confirm you are old enough."_
- A **date of birth** input (date picker or text input with `YYYY-MM-DD` format hint)
- The minimum age requirement shown as text: _"You must be at least [n] years old."_
- An **"I confirm"** button (primary, full width) — enabled only when a valid date has been entered
- Below the button:
  - A note about data handling: _"Your birth date is stored securely and never shared. It is only used for age verification."_

## States

| State        | Visual                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Default      | Card with birth date input, "I confirm" button (disabled), explanatory text                                             |
| Invalid date | Input shows red border + inline error: "Please enter a valid date (YYYY-MM-DD)"                                         |
| Underage     | After submission: inline error in red box: "You must be at least [n] years old to use this service." Button re-enabled. |
| Submitting   | Button shows spinner, "Verifying..." text, input disabled                                                               |
| Success      | Redirect to `/` (the main app)                                                                                          |
| Server error | Inline error: "Server error. Please try again later." Button re-enabled.                                                |

## Server Config Override (Admin)

Admins can change age gate settings at runtime via the API (no restart needed):

**GET /api/admin/age-gate** — view current config
**PUT /api/admin/age-gate** — update config

Body example for PUT:

To disable the gate entirely at runtime:

## API Reference

| Method | Path                   | Auth     | Description                                                                    |
| ------ | ---------------------- | -------- | ------------------------------------------------------------------------------ |
| GET    | `/api/age-gate/status` | Optional | Returns `{ enabled, passed, minimumAge, mode }`                                |
| POST   | `/api/age-gate/accept` | Required | Submit `{ birthDate: "YYYY-MM-DD" }`. Returns 200 on success, 403 if underage. |
| GET    | `/api/admin/age-gate`  | Admin    | View current runtime age gate config                                           |
| PUT    | `/api/admin/age-gate`  | Admin    | Update runtime age gate config                                                 |

### GET /api/age-gate/status

Response:

- When `enabled=false`, `passed` is always `true` — no gating.
- When `enabled=true` and `passed=false`, the client should redirect to `/age-gate`.

### POST /api/age-gate/accept

Request body:

Success (200):

Underage (403):

## States (Edge Cases)

| Scenario                                                 | Behaviour                                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate enabled, user passes, then admin raises minimum age | User's existing acceptance is still valid — no re-prompt. If the user's birth date is now below the new minimum, a future re-verification flow could prompt them. |
| Gate enabled, user passes, then admin disables gate      | No change — user simply never sees the gate again. Data stays in DB.                                                                                              |
| Gate re-enabled after being disabled                     | Previously-accepted users pass through — their birth_date + timestamp are still on file. New users see the gate.                                                  |
| Demo/solo mode with gate enabled                         | Solo user is redirected to `/age-gate` on first visit. Their birth_date is stored against the solo user record.                                                   |

## Data Model

Two nullable columns on the `users` table:

| Column                 | Type                 | Purpose                                                      |
| ---------------------- | -------------------- | ------------------------------------------------------------ |
| `birth_date`           | TEXT (ISO date)      | User's declared date of birth. NULL until gate is accepted.  |
| `age_gate_accepted_at` | TEXT (ISO timestamp) | When the user last accepted the gate. NULL until acceptance. |

Both remain NULL when the age gate is disabled — no data is stored.
