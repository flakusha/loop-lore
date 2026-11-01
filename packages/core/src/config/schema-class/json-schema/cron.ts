// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/cron.ts — re-export: single source cronMeta in sections/cron.ts
// Meta is canonical: "Master switch" description (mirror said "Master toggle").
import { cronMeta, } from "../../sections/cron";

export const cron = cronMeta;
