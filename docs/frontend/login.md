# Frontend: Login Page

**URL**: `/login`

## Overview

Authentication for multi-user mode. In solo/demo mode, this page is skipped entirely — the user goes directly to `/`.

## Layout

Centered card on a plain dark background (no sidebar, no navigation). Max-width 400px. The card sits vertically centered using flexbox.

## Card Contents

- Application logo/name at the top (same "loop-lore" text as sidebar, but larger: 24px)
- Error message area below the logo (hidden by default, shown with red text on login failure)
- Username field (text input, autofocus, required)
- Password field (password input, required)
- "Log In" button (primary, full width)
- Below the button (separated by a thin divider):
  - "Continue in demo mode" link (skips login, goes directly to `/` with a solo session)
  - "Don't have an account? Sign up" link (only shown if registration is enabled on the server)

## States

| State                           | Visual                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Default                         | Card with empty inputs, Log In button, demo mode link                                                  |
| Attempting login                | Button shows spinner, "Logging in..." text, both inputs disabled                                       |
| Login success                   | Redirect to `/`                                                                                        |
| Login failure (bad credentials) | Error text appears above inputs: "Invalid username or password." Button re-enables, inputs stay filled |
| Login failure (server error)    | Error text: "Server error. Please try again later."                                                    |
| Login failure (rate limited)    | Error text: "Too many attempts. Please wait [n] seconds."                                              |
| Server unreachable              | Toast only (login page itself loads fine — the error appears on submit)                                |

## Demo Mode

Clicking "Continue in demo mode": POST to `/api/demo-login` which creates a temporary solo session. Redirect to `/`. No credentials needed. Demo sessions have a user role of "solo" and may have limited functionality (no multi-device sync, no API configuration changes).
