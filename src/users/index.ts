// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/users/index.ts — user role + permission public API

export type { Permission, } from "./permissions";
export { can, DEFAULT_PERMISSIONS, hasAll, } from "./permissions";
export {
  ADMIN_ROLES,
  ALL_ROLES,
  ELEVATED_ROLES,
  isAdminRole,
  isElevatedRole,
  isValidRole,
} from "./roles";
