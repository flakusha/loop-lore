<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
<!-- Companion to: .plan/tickets/TASK-build-identity-hash-for-tamper-detection-searxng-style-commi.md -->
<!-- Research basis: .tmp/fed-research/topic-1-build-identity.md -->

# SPEC: Build Identity Hash for Tamper Detection — Implementation

**Companion to:** `TASK-build-identity-hash-for-tamper-detection-searxng-style-commi.md`
**Status:** ready for implementation
**Author:** research synthesis, 2026-09-24
**Research basis:** `/.tmp/fed-research/topic-1-build-identity.md`

---

## Design Decisions (resolved from open questions)

| Question (from research) | Decision | Rationale |
| --- | --- | --- |
| Sigstore public Fulcio vs self-hosted? | PUBLIC Fulcio for open-source use cases; per-instance opt-out flag for air-gap | Defaults to the easy path; operators in air-gap can disable keyless signing |
| Public Rekor vs private transparency log? | PUBLIC Rekor (default); private log behind a config flag | Smaller instances cannot run their own Rekor; public log is the lowest-friction choice |
| Reproducibility required? | NO in V1; commit-pin style (SearXNG) only. Sigstore provenance optional. | Reproducible builds need CI discipline loop-lore does not have; document as a follow-up. |
| 6h probe freshness concern? | No issue — SVIDs are short-lived, build identity is committed-to-source | Build identity never changes once published; freshness is not a concern for build hash |
| Verification budget (Rekor fetch + verify)? | Acceptable for 6h schedule even on small instances | One HTTP GET + one ECDSA verify ≈ 50ms; trivial cost |

---

## 1. Hash Composition

The build identity hash is a deterministic SHA-256 over four inputs:

```
buildHash = sha256(
  "v1" + "\n" +
  gitHead + "\n" +                 // 40-char hex from `git rev-parse HEAD`; or "nogit" fallback
  sourceTreeHash + "\n" +          // sha256 of git tree object at HEAD: `git rev-parse HEAD^{tree}`
  depsHash + "\n" +                 // sha256 of the lockfile bundle (see §2.2)
  manifestHash                     // sha256 of BUILD_MANIFEST JSON
)
```

The `"v1"` prefix pins the hash format so future schema changes can ship as `v2` without colliding with `v1` hashes.

A short identifier (`buildHashShort`) is the first 16 hex chars of `buildHash`.

---

## 2. Inputs in Detail

### 2.1 `gitHead` + `sourceTreeHash`

```ts
// src/build-identity/git.ts
import { spawn } from "bun";

export async function readGitHead(): Promise<{ gitHead: string; sourceTreeHash: string; available: boolean }> {
  try {
    const head = (await Bun.spawn(["git", "rev-parse", "HEAD"]).stdout.text()).trim();
    const tree = (await Bun.spawn(["git", "rev-parse", "HEAD^{tree}"]).stdout.text()).trim();
    return { gitHead: head, sourceTreeHash: tree, available: true };
  } catch {
    return { gitHead: "nogit", sourceTreeHash: "nogit", available: false };
  }
}
```

- In a Bun-built production binary (`./loop-lore start`), git is NOT available — the module returns `available: false` and emits the fallback hash.
- For dev runs (`bun run dev`), git is available and the real hash is emitted.
- For container builds, the hash is computed at image-build time (see §6 CI) and embedded as a build-time constant — runtime code then reads the constant.

### 2.2 `depsHash` — locked dependency fingerprint

```ts
// src/build-identity/deps.ts
import { sha256 } from "bun";
import { readFileSync } from "fs";

export async function computeDepsHash(): Promise<string> {
  const files = ["package.json", "bun.lock", "bunfig.toml"]
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p));
  const concat = new Uint8Array(files.reduce((acc, f) => acc + f.byteLength, 0));
  let offset = 0;
  for (const f of files) {
    concat.set(new Uint8Array(f), offset);
    offset += f.byteLength;
  }
  return `sha256:${Buffer.from(await sha256(concat)).toString("hex")}`;
}
```

The hash is over the raw bytes of `package.json + bun.lock + bunfig.toml` concatenated. A `bun.lock` edit changes the hash; a `bun.lock` regeneration with the same logical deps SHOULD change the hash too (Bun's lockfile format may canonicalize, but we treat the raw bytes as truth for V1).

### 2.3 `manifestHash` — build environment fingerprint

```ts
// src/build-identity/manifest.ts
export interface BuildManifest {
  bun_version: string;            // Bun.version
  platform: NodeJS.Platform;       // process.platform
  arch: string;                   // process.arch
  build_profile: "dev" | "production" | "test";
  node_compat: boolean;           // bun has node: built-ins
  built_at: string;               // ISO timestamp; OR SOURCE_DATE_EPOCH if set
}

export async function readManifest(): Promise<BuildManifest> {
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  const builtAt = sourceDateEpoch
    ? new Date(parseInt(sourceDateEpoch, 10) * 1000).toISOString()
    : new Date().toISOString();
  return {
    bun_version: Bun.version,
    platform: process.platform,
    arch: process.arch,
    build_profile: (process.env.NODE_ENV === "production" ? "production" : "dev") as BuildManifest["build_profile"],
    node_compat: true,
    built_at: builtAt,
  };
}

export async function computeManifestHash(): Promise<string> {
  const m = await readManifest();
  const json = JSON.stringify(m, Object.keys(m).sort()); // canonical
  return `sha256:${Buffer.from(await sha256(new TextEncoder().encode(json))).toString("hex")}`;
}
```

### 2.4 Final composition

```ts
// src/build-identity/compute.ts
import { sha256 } from "bun";

export interface BuildIdentity {
  buildHash: string;              // sha256:...
  buildHashShort: string;         // first 16 hex of buildHash
  gitHead: string;
  sourceTreeHash: string;
  depsHash: string;
  manifestHash: string;
  manifest: BuildManifest;
  computedAt: Date;               // not part of the hash; cache-busting only
}

let cached: Promise<BuildIdentity> | null = null;

export function getBuildIdentity(): Promise<BuildIdentity> {
  if (cached) return cached;
  cached = (async () => {
    const [git, depsHash, manifestHash, manifest] = await Promise.all([
      readGitHead(),
      computeDepsHash(),
      computeManifestHash(),
      readManifest(),
    ]);
    const canonical = [
      "v1",
      git.gitHead,
      git.sourceTreeHash,
      depsHash,
      manifestHash,
    ].join("\n");
    const digest = Buffer.from(await sha256(new TextEncoder().encode(canonical))).toString("hex");
    return {
      buildHash: `sha256:${digest}`,
      buildHashShort: digest.slice(0, 16),
      gitHead: git.gitHead,
      sourceTreeHash: git.sourceTreeHash,
      depsHash,
      manifestHash,
      manifest,
      computedAt: new Date(),
    };
  })();
  return cached;
}
```

The cache is process-lifetime. If `WATCH=1` (dev mode with HMR), invalidate on file change of `bun.lock` / `package.json` — but for V1, just memoize. Rebuilds restart the process anyway.

---

## 3. Endpoints

### 3.1 Public: `GET /.well-known/loop-lore/build-id`

Always mounted (not gated by federation opt-in — tamper detection is a baseline self-integrity surface).

```ts
// src/routes/build-id.ts
import { Elysia, t } from "elysia";
import { getBuildIdentity } from "../build-identity/compute";

export function buildIdPublicRoute(): Elysia {
  return new Elysia().get(
    "/.well-known/loop-lore/build-id",
    async () => {
      const id = await getBuildIdentity();
      return {
        buildHash: id.buildHash,
        buildHashShort: id.buildHashShort,
        gitHead: id.gitHead,
        builtAt: id.manifest.built_at,
      };
    },
    {
      detail: {
        summary: "Public build identity pin",
        description: "Compound hash over source + lockfile + build manifest. Self-report; peer-verifiable via `bun run build:verify`.",
        tags: ["Federation"],
      },
    },
  );
}
```

### 3.2 Admin: `GET /api/admin/build-id`

Admin-authz guarded. Returns the full breakdown for verification tooling.

```ts
// src/routes/admin/build-id.ts
export function buildIdAdminRoute(): Elysia {
  return new Elysia()
    .use(requireRole("admin"))
    .get("/api/admin/build-id", async () => {
      const id = await getBuildIdentity();
      return {
        buildHash: id.buildHash,
        buildHashShort: id.buildHashShort,
        gitHead: id.gitHead,
        sourceTreeHash: id.sourceTreeHash,
        depsHash: id.depsHash,
        manifestHash: id.manifestHash,
        manifest: id.manifest,
        computedAt: id.computedAt.toISOString(),
      };
    }, ...);
}
```

### 3.3 Inclusion in `instance-state`

Modify `src/routes/federation.ts` to add `buildHash` + `buildHashShort` to the `/api/instance-state` payload so peer gossip carries it without an extra fetch.

```ts
// existing code at /api/instance-state in src/routes/federation.ts
app.get("/api/instance-state", async () => {
  const id = await getBuildIdentity();
  return jsonResponse({
    // ... existing fields ...
    buildHash: id.buildHashShort,   // 16-char short; full hash available at /.well-known/loop-lore/build-id
    buildHashFull: id.buildHash,
  });
});
```

---

## 4. CLI: `bun run build:verify`

```ts
// scripts/build-verify.ts — runnable via `bun run scripts/build-verify.ts`
// Re-computes the build hash from a clean checkout and prints + optionally compares.
import { getBuildIdentity } from "../src/build-identity/compute";
import { argv } from "process";

async function main() {
  const id = await getBuildIdentity();
  console.log(JSON.stringify(id, null, 2));

  const expected = argv.find((a) => a.startsWith("--expected="))?.split("=")[1];
  if (expected) {
    if (expected === id.buildHash) {
      console.log("MATCH");
      process.exit(0);
    }
    console.error(`MISMATCH: expected ${expected}, got ${id.buildHash}`);
    process.exit(1);
  }
}
main();
```

The package.json script:
```json
{
  "scripts": {
    "build:verify": "bun run scripts/build-verify.ts"
  }
}
```

---

## 5. Module Layout

```
src/build-identity/
├── index.ts            # public: getBuildIdentity()
├── compute.ts          # canonical hash composition (the formula in §1)
├── git.ts              # readGitHead()
├── deps.ts             # computeDepsHash()
├── manifest.ts         # readManifest(), computeManifestHash()
└── build-identity.test.ts

src/routes/
├── build-id.ts         # public /.well-known/loop-lore/build-id
└── admin/build-id.ts   # admin /api/admin/build-id

scripts/
└── build-verify.ts     # bun run build:verify
```

The existing `instance-state` route gets a small addition (3 lines).

---

## 6. CI Integration

The build hash MUST be deterministic across CI runs. GitHub Actions workflow:

```yaml
# .github/workflows/build-identity.yml
name: build-identity
on: [push, pull_request]
jobs:
  compute:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: bun install --frozen-lockfile
      - name: Compute build identity
        env:
          SOURCE_DATE_EPOCH: ${{ fromJSON(steps.commit.outputs.timestamp) }}
        run: |
          bun run build:verify > .tmp/build-identity.json
      - uses: actions/upload-artifact@v4
        with:
          name: build-identity
          path: .tmp/build-identity.json
```

**Optional Sigstore provenance** (when `SIGSTORE_ENABLED=1`):

```yaml
      - name: Sigstore attest-build-provenance
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: actions/attest-build-provenance@v1
        with:
          subject-name: loop-lore-build-identity
          subject-path: .tmp/build-identity.json
          push-to-registry: false
```

The attestation lives in Rekor; peers can verify with `gh attestation verify .tmp/build-identity.json --owner $OWNER` or `cosign verify-attestation ...`. Verification is opt-in per peer — loop-lore does not block federation on Sigstore.

---

## 7. Validation

No body schemas needed (GET-only). The `BuildIdentity` TypeScript type is the contract.

---

## 8. Logging

Compute once at process start; log the short hash + git head:
```ts
log.event({ event: "build_identity.computed", buildHashShort: id.buildHashShort, gitHead: id.gitHead, build_profile: id.manifest.build_profile });
```

---

## 9. Test Plan

### Unit (`src/build-identity/build-identity.test.ts`)
- `computeDepsHash` deterministic — same files -> same hash; edit `bun.lock` -> hash changes; add a stray file to the bundle -> hash changes.
- `computeManifestHash` deterministic when `SOURCE_DATE_EPOCH` is set; varies with `Bun.version`.
- `getBuildIdentity` produces a hash matching the manual composition: take `v1` + gitHead + sourceTreeHash + depsHash + manifestHash, concat with `\n`, sha256, compare.
- Fallback when git is missing: `gitHead = "nogit"`, `sourceTreeHash = "nogit"`, `available: false`.
- The hash is identical for two `getBuildIdentity()` calls in the same process (memoization).
- `buildHashShort` is the first 16 hex chars of `buildHash` after the `sha256:` prefix.

### Endpoint (`src/routes/build-id.test.ts`)
- `GET /.well-known/loop-lore/build-id` returns `{ buildHash, buildHashShort, gitHead, builtAt }`.
- `GET /api/admin/build-id` requires admin role; non-admin returns 403.
- Admin endpoint returns full breakdown including `sourceTreeHash`, `depsHash`, `manifestHash`.

### CLI (`scripts/build-verify.test.ts`)
- `bun run build:verify` prints valid JSON with all required fields.
- `bun run build:verify --expected=<hash>` exits 0 on match, non-zero on mismatch with clear error.

### Integration
- Spin up two instances with the same source checkout + same `bun.lock`. Their `/api/admin/build-id` responses have identical `buildHash`.
- Spin up two instances where one has a `bun.lock` edit. Their `buildHash` differs.
- E2E: the federation probe (separate ticket) reads the build hash from a peer's `/.well-known/loop-lore/build-id` and verifies it against the operator-pinned value.

---

## 10. Acceptance Criteria (refined)

- [ ] `getBuildIdentity()` returns deterministic hash across processes with identical source + deps + manifest.
- [ ] `/.well-known/loop-lore/build-id` returns the public breakdown (always mounted).
- [ ] `/api/admin/build-id` returns full breakdown behind admin authz.
- [ ] `/api/instance-state` includes `buildHash` (short) + `buildHashFull`.
- [ ] `bun run build:verify` reproduces the hash; `--expected=...` flag exits 0/1 correctly.
- [ ] CI workflow `.github/workflows/build-identity.yml` runs on push + PR.
- [ ] Git-missing fallback: hash still computable, just with `"nogit"` placeholders.
- [ ] Optional Sigstore attestation behind `SIGSTORE_ENABLED=1` flag.
- [ ] Tests cover deterministic hash, fallback, lockfile-edit hash change, endpoint shapes, CLI round-trip.
- [ ] `bun run check` green.

---

## 11. Out-of-Scope Follow-Ups

- Reproducible builds (Debian `.buildinfo` / Nix content-addressing) — requires CI discipline, flagged as follow-up.
- SPKI-pinning of the build artifact itself (Tailscale-style) — separate ticket if needed.
- Sigstore keyless signing in the Bun runtime — would require Bun-level integration, currently a GitHub Actions-only feature.

---

## 12. References

1. SearXNG live footer: `https://searx.tiekoetter.com` — `2026.9.22+2ed96e6fc (e535c94ee)`
2. SearXNG docs: https://docs.searxng.org/admin/buildhosts.html
3. npm provenance walkthrough 2026: https://safeguard.sh/resources/blog/npm-provenance-attestations-walkthrough-2026/
4. Build Provenance & Attestations: https://www.git-automation.com/commit-signing-supply-chain-security/build-provenance-and-attestations/
5. Reproducible builds security: https://www.systemshardening.com/articles/linux/reproducible-builds-security/
6. Debian rebuilds 2026: https://www.bigiron.cc/guides/reproducible-builds-and-the-2026-state-of-debian-rebuilds/
7. GitHub actions/attest-build-provenance: https://github.com/actions/attest-build-provenance
8. Sigstore in-toto attestations: https://docs.sigstore.dev/cosign/verifying/attestation/
9. Research synthesis: `/.tmp/fed-research/topic-1-build-identity.md`
