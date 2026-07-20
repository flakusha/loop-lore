> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Platform Support

## Runtime Compatibility

### Bun

Bun provides first-class support for Linux, macOS, and Windows (v1.0+). Android support is available via community builds (Termux) starting with v1.3.14.

| Platform          | Status         | Notes                                                                 |
| ----------------- | -------------- | --------------------------------------------------------------------- |
| Linux x64/arm64   | ✅ Full        | Native builds, glibc and musl variants                                |
| macOS x64/arm64   | ✅ Full        | Native builds                                                         |
| Windows x64/arm64 | ✅ Full        | Requires Windows 10 version 1809+                                     |
| Android (Termux)  | ⚠️ Experimental | Community builds via glibc-runner or official ARM64 builds (v1.3.14+) |

### Deno

Deno does not officially support Android or mobile platforms. Experimental support exists via Termux with manual patching.

| Platform          | Status      | Notes                                              |
| ----------------- | ----------- | -------------------------------------------------- |
| Linux x64/arm64   | ✅ Full     | Native builds                                      |
| macOS x64/arm64   | ✅ Full     | Native builds                                      |
| Windows x64/arm64 | ✅ Full     | Native builds                                      |
| Android (Termux)  | ⚠️ Community | Requires glibc-runner shim, manual binary patching |

## Windows Support

### Current State

Partial Windows compatibility exists. Core runtime and database layers work; TUI and some tooling require attention.

### Actionable Items

#### ✅ Completed

- `src/services/external-server-utils.ts:22` — Binary discovery handles `.exe` suffix on Windows
- `src/services/server-external-manager.ts:333,364` — Process killing omits signal strings on Windows (SIGTERM/SIGKILL unsupported)
- `src/config/cert.ts:44-45` — TLS certificate generation tries `openssl.exe` on Windows

#### ⚠️ TUI Limitations

- `blessed` library has no mouse/resize event support on Windows (per upstream docs)
- TUI works in Windows Terminal/ConEmu but with reduced functionality
- Consider documenting alternative: WSL2 for full TUI experience

**Action:** Add Windows TUI caveat to `docs/spec/tui.md`:

> TUI on Windows: Mouse and resize events are not supported. Use WSL2 or Windows Terminal for best experience.

#### ⚠️ Build Scripts

- `scripts/build-frontend.sh` — Bash script requires Git Bash, WSL, or PowerShell Core
- `package.json:42` — `killall chrome-headless-shell` is Unix-only

**Actions:**

1. Create `scripts/build-frontend.ps1` for PowerShell users
2. Replace `killall` with cross-platform process kill:

```json
"pretest:e2e:browser": "bun run src/scripts/kill-chrome.ts"
```

#### ⚠️ Shell Commands in Scripts

- `src/scripts/commit-check.ts:130` — Uses `git describe --tags --abbrev=0 2>/dev/null || echo ''`
- `src/scripts/version-bump.ts:73,120,138` — Unix-specific shell patterns

**Actions:**

1. Replace shell redirects (`2>/dev/null`) with Node.js `child_process` error handling
2. Use `cross-spawn` or Bun's native `spawn` for cross-platform compatibility

### Windows Installation Guide

```powershell
# 1. Install Bun for Windows
powershell -c "irm bun.sh/install.ps1|iex"

# 2. Install OpenSSL (for TLS certs)
# Option A: Scoop
scoop install openssl

# Option B: Manual download
# https://slproweb.com/products/Win32OpenSSL.html

# 3. Run with Git Bash or PowerShell Core
bun run dev
```

## Android (Termux) Support

### Bun on Termux

Official Android builds available starting v1.3.14. Community-maintained Termux packages:

```bash
# Official method (v1.3.14+)
pkg install bun

# Or use community build
curl -fsSL "https://bun.termux.party/" | bash
```

### Limitations

- TUI requires terminal with proper terminfo support
- No native GUI support
- External server binaries (llama.cpp, sd.cpp) must be compiled for Android or run via Termux packages
- SQLite database works; file paths use Termux prefix (`$PREFIX`)

### Actionable Items

1. **Document Termux setup** in `docs/spec/build-deploy.md`:
   - Install glibc-runner for older Bun versions
   - Set `LOOP_LORE_DB_PATH` to Termux-friendly location
   - Note: External AI servers require Android-compiled binaries

2. **Test on Android** — Add CI workflow with Termux environment (future consideration)

## Cross-Platform Considerations

### Path Handling

All path operations use `node:path` which handles separators correctly. No hardcoded `/` or `\` found.

### Signal Handling

Unix signals are abstracted in `server-external-manager.ts`. Windows uses terminate() instead of signal strings.

### Process Management

- Use `Bun.spawn` or `child_process.spawn` (cross-platform)
- Avoid `child_process.exec` with shell syntax (pipes, redirects)
- Use native Node.js APIs where possible for Bun/Deno compatibility

### File System

- SQLite works across platforms
- `bun:sqlite` uses same file format
- Consider `path.join()` for all paths (already in use)

## Future Platform Targets

### Bun Mobile

Bun has experimental Android builds. For mobile client apps:

- Use Termux for server-side execution
- Consider Bun Desktop for desktop apps with mobile sync

### Deno Mobile

No official support. Would require:

- Termux glibc-runner shim
- Manual binary patching (see: https://gist.github.com/omar-azmi/9510958fe24a7374856ccc75217330d5)

### WebAssembly

Both Bun and Deno support WASM. Consider:

- WASM build target for browser execution
- WASM edge functions for cross-platform deployment

## Testing Matrix

| Platform | Runtime      | TUI | Web UI | API | Database | External Servers |
| -------- | ------------ | --- | ------ | --- | -------- | ---------------- |
| Linux    | Bun/Deno     | ✅  | ✅     | ✅  | ✅       | ✅               |
| macOS    | Bun/Deno     | ✅  | ✅     | ✅  | ✅       | ✅               |
| Windows  | Bun          | ⚠️   | ✅     | ✅  | ✅       | ⚠️ (binaries)     |
| Android  | Bun (Termux) | ⚠️   | ✅     | ✅  | ✅       | ❌ (native only) |

## Recommendations

1. **Primary target**: Linux (server), macOS (development)
2. **Secondary target**: Windows (desktop use via WSL2 or PowerShell)
3. **Experimental**: Android via Termux for development/testing
4. **Avoid**: Mobile app distribution (no official runtime support)

## Related Files

- `src/services/server-external-manager.ts` — Platform-specific process handling
- `src/config/cert.ts` — TLS generation with platform hints
- `src/services/external-server-utils.ts` — Binary discovery with `.exe` suffix
- `scripts/build-frontend.sh` — Build script requiring shell port
- `package.json` — Scripts with Unix assumptions
