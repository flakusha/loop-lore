/**
 * Build identity verifier — recomputes the local build hash and (optionally)
 * compares it against the value served by a remote instance at
 * `/.well-known/loop-lore/build-id`.
 *
 * Usage:
 *   bun run build:verify                       # print local buildHash
 *   bun run build:verify --url <origin>        # print local, then fetch + diff remote
 *   bun run build:verify --url <origin> --admin # also fetch /api/admin/build-id
 *                                              #   (requires admin auth in env:
 *                                              #   BUILD_VERIFY_ADMIN_TOKEN)
 *
 * Exit code:
 *   0  — local computed, remote (if requested) matches local
 *   1  — remote (if requested) does NOT match local
 *   2  — script/network error (printed to stderr)
 */
import { computeBuildIdentity, } from "../src/build/identity";

interface CliArgs {
  url?: string;
  admin?: boolean;
}

function parseArgs(argv: readonly string[],): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") {
      const v = argv[i + 1];
      if (!v) { throw new Error("--url requires a value",); }
      out.url = v;
      i++;
    } else if (a === "--admin") {
      out.admin = true;
    }
  }
  return out;
}

async function fetchRemote(origin: string, path: string, adminToken?: string,): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { accept: "application/json", };
  if (adminToken) { headers.authorization = `Bearer ${adminToken}`; }
  const res = await fetch(`${origin.replace(/\/$/, "",)}${path}`, { headers, },);
  if (!res.ok) {
    throw new Error(`fetch ${path} → HTTP ${res.status}`,);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2,),);
  const local = await computeBuildIdentity({ force: true, },);

  process.stdout.write(`local buildHash:    ${local.buildHash}\n`,);
  process.stdout.write(`local buildHashShort: ${local.buildHashShort}\n`,);
  process.stdout.write(`local gitHead:      ${local.gitHead || "(none)"}\n`,);
  process.stdout.write(`local builtAt:      ${local.builtAt}\n`,);

  if (!args.url) { return 0; }

  let remote: Record<string, unknown>;
  try {
    remote = await fetchRemote(args.url, "/.well-known/loop-lore/build-id",);
  } catch (err) {
    process.stderr.write(`remote fetch failed: ${(err as Error).message}\n`,);
    return 2;
  }

  const remoteBuildHash = typeof remote.buildHash === "string" ? remote.buildHash : "";
  process.stdout.write(`remote buildHash:   ${remoteBuildHash}\n`,);

  if (args.admin) {
    const token = process.env.BUILD_VERIFY_ADMIN_TOKEN;
    if (!token) {
      process.stderr.write("--admin requires BUILD_VERIFY_ADMIN_TOKEN\n",);
      return 2;
    }
    try {
      const admin = await fetchRemote(args.url, "/api/admin/build-id", token,);
      process.stdout.write(`remote manifestHash: ${admin.manifestHash}\n`,);
      process.stdout.write(`remote sourceTreeHash: ${admin.sourceTreeHash}\n`,);
    } catch (err) {
      process.stderr.write(`admin fetch failed: ${(err as Error).message}\n`,);
      return 2;
    }
  }

  if (remoteBuildHash !== local.buildHash) {
    process.stderr.write("MISMATCH: remote buildHash does not match local\n",);
    return 1;
  }
  process.stdout.write("OK: remote buildHash matches local\n",);
  return 0;
}

await main().then(
  (code,) => process.exit(code,),
  (err: unknown,) => {
    process.stderr.write(`verify failed: ${(err as Error).message}\n`,);
    process.exit(2,);
  },
);
