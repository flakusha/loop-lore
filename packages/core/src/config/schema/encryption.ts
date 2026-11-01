// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/encryption.ts — Encryption / SMK config type

import type { EncryptionSection, } from "../sections/encryption";

export type EncryptionConfig = InstanceType<typeof EncryptionSection>;
