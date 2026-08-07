/**
 * User route validation schemas.
 */

import { t, } from "elysia";
import { DisplayName, Id, } from "./primitives";

// ── User routes ────────────────────────────────────────────

export const UserProfileUpdateBody = t.Object({
  displayName: t.Optional(DisplayName,),
  birthDate: t.Optional(t.String(),),
  settings: t.Optional(t.Any(),),
},);

export const UserIdParams = t.Object({
  id: Id,
},);
