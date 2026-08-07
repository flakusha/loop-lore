/**
 * Login route validation schema.
 */

import { t, } from "elysia";

// ── Login ──────────────────────────────────────────────────

export const LoginBody = t.Object({
  username: t.String({ minLength: 1, },),
  password: t.String({ minLength: 1, },),
},);
