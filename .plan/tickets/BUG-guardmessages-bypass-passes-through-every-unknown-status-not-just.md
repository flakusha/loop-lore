<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: guardMessages bypass passes through every unknown status, not just the legacy "visible" default

**Status:** Not Started
**Priority:** high
**Effort:** Small (narrow the bypass to a named constant + restore the reject assertion; optional 032 backfill migration)
**Summary:** `guardMessages` (`src/db/validators/enforce.ts:100-110`) returns early for *any* status outside `MessageStatus`, not just the one legacy value it exists to tolerate. `""`, `"CONFIRMED"`, `"Sending"`, `"totally_bogus"`, `"null"` all pass where the pre-`7de2fcb49` guard threw, and `src/db/validators/enforce.test.ts:26-33` was inverted in the same commit to lock in the fail-open. Narrow the bypass to the named legacy literal and restore the reject assertion.
**Context:** Follow-up commit `7de2fcb49` ("fix(db): tolerate the legacy messages.status default in the write guard") fixed a real regression — `messages.status` carries a DB-level default of `"visible"` which is not a `MessageStatus` member, so `updateMessageVisibility` on any default-inserted or legacy row threw and the write silently did not happen. The motivation is correct; the *scope* is not. `isKnownStatus()` (`:75-77`) is a membership test over `KNOWN_STATUSES` (`:79`), so "not in the enum" and "the legacy DB default" are conflated. Filed after a by-execution audit of the guard against the real migration defaults and every write path; three further defects found during that audit are recorded in the *Additional defects* section.

## The defect

`src/db/validators/enforce.ts:100-110` (HEAD `bb1a08a7a`):

```ts
const guardMessages: RowGuard = (row) => {
  const status = readAxis(row, "messages", "status");
  if (!isKnownStatus(status,)) { return; }        // :102 — fails OPEN on every unknown value
  assertPair("messages", messagesStatusVisibility, status, readAxis(row, "messages", "visibility"), "status x visibility",);
};
```

`guardShadowNotes` (`:112-121`) and `guardCharacterLicensing` (`:123-136`) have no such bypass. The bypass is also documented as intentional in the module header at `:21-25` ("an unrecognised axis is passed through unchecked"), so the current behaviour is pinned by prose as well as by test.

### Execution evidence — the bypass is broader than the legacy value

Probe importing the real module from `tree/feat-write-validators` (`bun .tmp/guard-bypass-probe.ts`):

```
== guardMessages: status x visibility ==
  PASS-THROUGH (no throw)  status="visible" vis=hidden_by_moderator  <- legacy default 'visible'
  PASS-THROUGH (no throw)  status="" vis=visible  <- empty string
  PASS-THROUGH (no throw)  status="CONFIRMED" vis=visible  <- wrong case CONFIRMED
  PASS-THROUGH (no throw)  status="Sending" vis=visible  <- wrong case Sending
  PASS-THROUGH (no throw)  status="totally_bogus" vis=visible  <- bogus
  PASS-THROUGH (no throw)  status="null" vis=visible  <- literal 'null'
  THROWS                    status="sending" vis=hidden_by_user  <- enum member w/ illegal pair: assertValidWrite: messages status x visibility sending:hidden_by_user is not a legal state pair
```

Only the last row throws — i.e. the guard still does its job for real `MessageStatus` members, and has **zero** enforcement for everything else.

### Execution evidence — the pre-`7de2fcb49` guard rejected a legitimate write

The regression the fix was responding to, reproduced by reading the parent revision's test (removed at `7de2fcb49`, `src/db/validators/enforce.test.ts`):

```diff
-  test("rejects an unknown status rather than passing it through", () => {
-    expect(() => {
-      assertValidWrite("messages", { status: "visible", visibility: "visible", });
-    }).toThrow(/not a legal state pair/);
+  test("passes through the legacy 'visible' status default instead of throwing", () => {
+    expect(() => {
+      assertValidWrite("messages", { status: "visible", visibility: "hidden_by_moderator" });
+    }).not.toThrow();
   });
```

The motivation is real and must not be reverted: `updateMessageVisibility` (`src/chat/service/visibility.ts:46`) reads the persisted `status` and merges it into the guarded row, so a row carrying the DB default is fed straight into the guard. It is called by the profanity gate at `src/routes/messages/create.ts:179` and `src/routes/messages/forward.ts:148`, and by `src/chat/service/visibility.test.ts:42`. The bypass is necessary; it just must be one value wide.

### The test was inverted in the same commit

`src/db/validators/enforce.test.ts:26-33` deleted the "rejects an unknown status rather than passing it through" assertion and replaced it with a `.not.toThrow()` on the same `"visible"` input. The suite therefore *cements* the fail-open: narrowing the bypass to the legacy literal alone keeps this test green, but nothing in the suite pins the rejection of `""` / `"CONFIRMED"` / `"totally_bogus"` that the previous revision enforced. Per the audit rule that existing wording/implementation tests get deleted rather than re-pinned, this test must be rewritten to assert the narrow bypass plus the rejection, not extended as-is.

## Verification of the five checks

**1. Is the DB default exactly `"visible"`?** Yes. `src/db/migrations/001_init.ts:1864`:

```ts
.addColumn("status", "text", (col,) => col.notNull().defaultTo("visible",),)
```

inside `createTable("messages")` (`:1844`). Unchanged by any forward migration — `src/db/migrations/002`–`027` touch no `messages.status` column. The same literal is also the default for `messages.visibility` (`:1865`), `world_items.visibility` (`:555`) and `blog_comments.status` (`:2976`); only the `messages` one is guarded by a composite whose enum disagrees with the default. `"visible"` is a member of `MessageVisibility` (`src/db/enums-core/messages.ts:48-54`) — the copy-paste that put a *visibility* value into a *status* column.

**2. Is `"visible"` a real `MessageStatus` member?** No — the framing under audit is correct. `src/db/enums-core/messages.ts:37-44`:

```ts
export const MessageStatus = {
  Sending: "sending", Confirmed: "confirmed", Failed: "failed",
  Partial: "partial", Rejected: "rejected", Cancelled: "cancelled",
} as const;
```

Six members, none named `"visible"`. `KNOWN_STATUSES` (`:79`) is built from these, so `"visible"` is genuinely unrecognised and the bypass is genuinely needed.

**3. Can an untrusted value reach `messages.status`?** Not directly — but the untrusted path is one hop away and it is still a guard bypass in a security-adjacent path. Complete enumeration of `assertValidWrite("messages", ...)` call sites (2 total):

| Call site | `status` provenance | User-reachable? |
|---|---|---|
| `src/chat/service/visibility.ts:46` | `SELECT status` from the row being updated | Indirect — the value is whatever is *already stored* |
| `src/chat/service/write.ts:153` | hard-coded `MessageStatus.Sending` (`:148`) | No |

No caller passes a request-supplied string into `status`. The only route that writes `messages.status` from user input is `PUT /api/messages/:id/status` (`src/routes/messages/update.ts:212-221`), which is `admin.chat`-gated (`:216`) and schema-validated by `MessageStatusUpdateBody` → `MessageStatusSchema` (`src/validation/db-schemas.ts:314`), and which does **not** call `assertValidWrite` at all.

The real exposure is upstream of the guard: **three** production insert sites omit `status` entirely, so the column default writes `"visible"` into every one of those rows — `src/assistant/entity-spec/handoff.ts:112`, `src/rpg/questions/service.ts:226`, `src/seeding/chats.ts:107`. None spreads a caller-supplied object into `.values({})`, so the omission is unconditional. Every such row is thereafter permanently un-guarded. Severity is `high` not because an attacker types a status, but because a whole class of rows has silently opted out of the invariant.

The count matters: an enumeration of all 21 production `insertInto("messages")` sites finds exactly these 3 without a `status` key. Two near-misses that look like omissions but are **not** — do not "fix" them: `src/generation/generate-route/persist.ts:105` uses object **shorthand** (`status,` at `:122`, from `persist.ts:65`), and `src/chat/service/write.ts:154` passes `variantRow`, which sets `status: MessageStatus.Sending` at `:148`. A regex that greps for `status:` rather than parsing the call chain misreports both as omissions.

**4. Is a backfill migration feasible, and which prefix?** Feasible, and `032` is the correct number.

- The enum's own history does not block it: `messages.status` was never a real state axis before `MessageStatus` landed — the column shipped with a *visibility* default in `001_init.ts:1864`, so no row written before the enum can carry a meaningful status. Every pre-enum value is either `"visible"` or a post-enum value the enum already covers. There is no third state to preserve.
- Mapping target: `MessageStatus.Confirmed` is the only correct landing spot. `sending` is non-terminal and must pair with `visible`; `confirmed` pairs with every visibility (`src/db/enums-core/messages.ts:95-107` lists `confirmed:visible` … `confirmed:redacted`). A `"visible"`-status row is by definition a finished, displayable message, so `confirmed` is exact, not a compromise.
- Migration shape (SQLite allows one `ALTER` per statement; a data-only remap needs no table rebuild, unlike the CHECK rebuild in `src/db/migrations/022_prompt_templates_workflow_modality.ts:19-22`):
  ```sql
  UPDATE messages SET status = 'confirmed' WHERE status = 'visible';
  ```
  then rebuild the default in the same migration, **or** leave the default alone and rely on the narrowed bypass. Preferred: rebuild `messages` with `DEFAULT 'confirmed'` so no *new* row is born legacy. `down()` re-maps `confirmed` → `visible` only for rows the `up()` touched — track that with a marker column or accept the documented lossy rollback (the pattern `022:114-117` already uses).
- **Prefix is `032`.** `feat-db-019-sweep` holds `029_hot_path_indexes.ts`, `030_audit_columns_underdocumented_tables.ts`, `031_content_versioning_heavy_tables.ts`; three other branches claim `028`; `dev` HEAD is at `027_world_simulation_state.ts`. `032` is the next free prefix and must not reuse a claimed number. Re-check at implementation time — the `001_init.ts:20-21` header warns "do not skip ahead", and `BUG-duplicate-migration-numeric-prefix-021` records what a collision costs.
- The migration is **optional** for the correctness fix. The one-line bypass narrowing is the fix; `032` removes the need for the bypass to exist at all. Land the narrowing regardless.

**5. Do `shadow_notes` / `character_licensing` have the same legacy-default problem?** **No — the priority hypothesis is refuted by execution.** Both guarded tables' DB defaults are *members* of their enums, so neither needs a bypass and neither currently throws on a legitimate pre-existing row:

```
=== is each default a member of its enum? ===
  LEGACY!  messages.status: default "visible" in [sending, confirmed, failed, partial, rejected, cancelled]
  MEMBER   messages.visibility: default "visible" in [visible, hidden_by_user, hidden_by_moderator, auto_hidden, redacted]
  MEMBER   shadow_notes.status: default "hidden" in [hidden, revealed]
  MEMBER   shadow_notes.visibility: default "user_visible" in [user_visible, hidden]

=== the DB-default pair per table, through the guard ===
  OK      messages {"status":"visible","visibility":"visible"}
  OK      shadow_notes {"status":"hidden","visibility":"user_visible"}
  OK      character_licensing {"allow_derivatives":1,"share_alike":0}
```

- `shadow_notes.status` defaults to `"hidden"` (`001_init.ts:2427`), which is `ShadowNoteStatus.Hidden` (`src/db/enums-gm.ts:50-53`). Its `visibility` column was added by `002_shadow_notes_visibility.ts:31-38` with `defaultTo("user_visible")`, also a member. Both DB defaults form a legal pair (`hidden:user_visible` is the first entry in `shadowNotesStatusVisibility.allowed`, `src/db/enums-gm.ts:97-101`), and `hidden:hidden` is legal too — every pre-`002` row backfills to `user_visible`, which passes.
- `character_licensing.allow_derivatives` defaults to `1` and `share_alike` to `0` (`001_init.ts:1291`, `:1293`), mapping to `allowed:no`, the first entry in `shareAlikeDerivatives.allowed` (`src/characters/license-enforcement.ts:68-72`). No legacy drift possible.
- Neither table has a write path that can persist an out-of-enum value: the only `shadow_notes` writer setting `status` is the reveal transition (`src/routes/gm-notes/shadow.ts:206`, hard-coded `ShadowNoteStatus.Revealed`); both inserts hard-code `ShadowNoteStatus.Hidden` (`src/routes/gm-notes/shadow.ts:165`, `src/chat/proactive/annotations.ts:125`), and `ShadowNoteBody` (`src/routes/gm-notes/schemas.ts:13-31`) does not accept `status` or `visibility` at all. All `character_licensing` write sites compose 0/1 ints from booleans or from `?? 1` / `?? 0`.

So there is **no** unhandled production hazard on `shadow_notes`/`character_licensing` of the kind anticipated. The real hazards are in the opposite direction, and are filed below.

## Remediation

Narrow the bypass to the named legacy value, and restore rejection for everything else:

```ts
/** `001_init.ts:1864` — NOT NULL DEFAULT 'visible'; a member of MessageVisibility, never of MessageStatus. */
const LEGACY_MESSAGES_STATUS = "visible";

/** @throws {Error} when the value is neither a MessageStatus nor the known legacy default. */
function assertKnownStatus(value: string,): void {
  if (value === LEGACY_MESSAGES_STATUS) { return; }
  if (!KNOWN_STATUSES.has(value,)) {
    throw new Error(`assertValidWrite: messages.status ${JSON.stringify(value)} is not a MessageStatus`);
  }
}

const guardMessages: RowGuard = (row) => {
  const status = readAxis(row, "messages", "status");
  assertKnownStatus(status,);              // :102 — legacy value exempt, garbage rejected
  if (status === LEGACY_MESSAGES_STATUS) { return; }
  assertPair("messages", messagesStatusVisibility, status, readAxis(row, "messages", "visibility",), "status x visibility",);
};
```

Steps:

1. Replace `isKnownStatus` (`:75-77`) with `assertKnownStatus`; keep `KNOWN_STATUSES` (`:79`) as-is.
2. Delete the `!isKnownStatus` early return in `guardMessages` (`:100-110`).
3. Update the module header at `:21-25` — it currently documents the fail-open as intended; the new wording names `LEGACY_MESSAGES_STATUS` specifically.
4. Rewrite `src/db/validators/enforce.test.ts:26-33`: one test asserting `"visible"` still passes through, **and** a test asserting `""`, `"CONFIRMED"`, and `"totally_bogus"` each throw. The current `.not.toThrow()`-only test must not survive as the sole coverage.
5. Optional but recommended: migration `032_messages_status_backfill.ts` per check 4. Once it lands, `LEGACY_MESSAGES_STATUS` can be deleted and `guardMessages` collapses back to a plain `assertPair`.
6. Regenerate `.plan/code-map.json` — `7de2fcb49` already had to regenerate it for this module.

## Additional defects found while verifying

These are **separate** defects in the same new module. Filing them here rather than opening three tickets keeps the write-validators workstream's findings in one place; they can be split if preferred.

**(a) `guardCharacterLicensing` makes a user-reachable request a 500.** `src/routes/character-licensing.ts:154` and `:169` call `assertValidWrite` on `composeLicenseRow(...)` output. `LicensingBody` (`src/validation/schemas/character-relations.ts:81-88`) types the flags as independent optional booleans with no cross-field constraint, so `{ allow_derivatives: false, share_alike: true }` is schema-valid. `composeLicenseRow` (`src/routes/character-licensing-helpers.ts:63-66`) maps that to `{ allow_derivatives: 0, share_alike: 1 }` = `forbidden:yes`, which the guard rejects. Executed:

```
=== A) POST /licensing — user body -> composeLicenseRow -> assertValidWrite ===
  THROWS  share-alike WITHOUT derivatives (user-legal license text): -> {deriv:0, sa:1} -> assertValidWrite: character_licensing allow_derivatives x share_alike forbidden:yes is not a legal state pair
  OK      derivatives without share-alike (legal): -> {deriv:1, sa:0}
  OK      both true (legal): -> {deriv:1, sa:1}
  OK      both false (legal): -> {deriv:0, sa:0}
  (LicensingBody does NOT constrain the combination: ["license_type","custom_license_text","attribution","allow_derivatives","allow_commercial","share_alike"])
```

The throw is a plain `Error`, so `onValidationError` (`src/validation/middleware.ts:102-117`) falls through to the 500 branch and returns a generic `SERVER_ERROR` — a client-side input error surfacing as an opaque 500. Either tighten `LicensingBody` (add a cross-field check so it 422s at the boundary) or have the route catch and return 400. `TASK-gate-licensing-triple-via-licenserightsvalidator` is the open ticket that owns the licensing-rights invariant and is the natural place for the 400 mapping.

**(b) `importLicensing` feeds card-file values straight into `readFlag`.** `src/characters/importers/character-systems/licensing.ts:36-43` (update) and `:48-57` (insert) cast `data.allowDerivatives as number` with `?? 1`. The importer's own fixture uses booleans (`src/characters/shared/character-systems-utils.test.ts:39-41`: `allowDerivatives: true`), and `character-systems-utils.ts:12-14` maps the column straight to the export field, so a card file carrying booleans reaches `readFlag` (`enforce.ts:62-72`) and throws. Executed:

```
=== B) importLicensing — card-file value straight into assertValidWrite ===
  THROWS  card booleans true/false: {"allow_derivatives":true,...} -> assertValidWrite: character_licensing.allow_derivatives must be 0 or 1 on the write, got true
  THROWS  card booleans false/true: {"allow_derivatives":false,...} -> assertValidWrite: character_licensing.allow_derivatives must be 0 or 1 on the write, got false
  OK      card numbers 1/0: {"allow_derivatives":1,...}
```

The throw is caught by the importer's own `try/catch` (`:65-67`) and pushed to `result.errors`, so it degrades to a silently-dropped license import rather than a crash — still a data loss on a legitimate file. Fix in `importLicensing`: `booleanToInt(Boolean(data.allowDerivatives), 1,)` (the same helper the route uses).

**(c) The legacy bypass now lets a `"visible"` row reach every visibility.** Executed:

```
=== C) messages guard: legacy row can now reach EVERY visibility ===
  PASS    legacy status 'visible' x visible
  PASS    legacy status 'visible' x hidden_by_user
  PASS    legacy status 'visible' x hidden_by_moderator
  PASS    legacy status 'visible' x auto_hidden
  PASS    legacy status 'visible' x redacted
```

That is the *intent* of the bypass and is what the `032` backfill would eliminate. Recorded so the narrowed bypass is not mistaken for a regression when a future guard tightens this.

**Acceptance Criteria:** Bypass narrowed to one named legacy value; unknown statuses rejected again; user-reachable 500 and importer boolean defect resolved; `032` backfill migration landed or explicitly deferred.

## Acceptance Criteria

- [ ] `guardMessages` bypass is exactly one value wide, named by a `LEGACY_MESSAGES_STATUS` constant citing `001_init.ts:1864`; `isKnownStatus`'s fail-open `return` is gone.
- [ ] `assertValidWrite("messages", { status: "" , … })`, `{ status: "CONFIRMED", … }`, and `{ status: "totally_bogus", … }` all throw; `{ status: "visible", … }` still does not.
- [ ] `guardMessages` still throws on `sending:hidden_by_user` (regression guard for the real enum members).
- [ ] Module header at `enforce.ts:21-25` no longer describes the fail-open as intended.
- [ ] (a) resolved — `POST /api/actors/:actorId/licensing` with `{ allow_derivatives: false, share_alike: true }` returns a 4xx with a field-level message, not a 500.
- [ ] (b) resolved — a card file with boolean license flags imports without error.
- [ ] Migration `032_messages_status_backfill.ts` landed, or a ticket records the decision to skip it. `032` must not collide with `028`–`031` claimed by other branches.
- [ ] `bun run check` green.

**Tags:** db, state-machine, validators, fail-open, guard
**Related:** src/db/validators/enforce.ts, src/db/validators/enforce.test.ts, src/db/enums-core/messages.ts, src/db/migrations/001_init.ts, src/chat/service/visibility.ts, src/routes/messages/create.ts, src/routes/messages/forward.ts, src/routes/character-licensing.ts, src/characters/importers/character-systems/licensing.ts, TASK-019-enforce-state-machine-validators-at-write, TASK-gate-licensing-triple-via-licenserightsvalidator, BUG-duplicate-migration-numeric-prefix-021
