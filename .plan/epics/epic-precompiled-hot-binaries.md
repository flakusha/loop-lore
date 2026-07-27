# EPIC: Pre-Compiled Hot Binary Modules

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Infrastructure Epic
**Tags:** native-modules, ffi, hot-reload, performance, binary-distribution

## Summary

High-performance native modules with pre-compiled binaries and hot-reload support.
Enables CPU-intensive operations (crypto, compression, image processing, ML inference)
to run at native speed while maintaining development ergonomics through hot-reload.
Uses Bun FFI for native addon loading with a pure-JS fallback for compatibility.

## Motivation

loop-lore's performance targets (API p95 < 50ms, message throughput > 500 msg/s)
require CPU-intensive operations to run at native speed. Pure TypeScript/JavaScript
is insufficient for:

- **Encryption/decryption** of assets and session data
- **Image/audio/video processing** (resize, thumbnail, transcode)
- **ML inference** (embedding generation, classification)
- **Compression** (gzip, brotli, zstd for asset storage)
- **Cryptographic hashing** (SHA-256, BLAKE3 for content addressing)

Bun FFI provides a path to native performance without the complexity of Node.js
native addons (N-API). Pre-compiled binaries eliminate build-toolchain requirements
for end users. Hot-reload enables fast iteration during development.

## Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Application Code                      │
│  (TypeScript — calls into module API, unaware of native) │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  Module Loader                            │
│  (Bun FFI / fallback to pure JS)                        │
└──────┬──────────────────────────────┬───────────────────┘
       │                              │
       │ Native                       │ Pure JS Fallback
       │                              │
┌──────▼──────────┐         ┌────────▼───────────────────┐
│ Pre-compiled    │         │ Pure JavaScript             │
│ Binary          │         │ (wasm/js)                   │
│ (per-platform)  │         │                             │
└─────────────────┘         └─────────────────────────────┘
```

### Module Interface

All modules implement a common interface with a pure-JS fallback:

```typescript
interface NativeModule {
  // Module metadata
  name: string;
  version: string;
  platform: string;
  arch: string;

  // Initialize (load binary or wasm)
  init(): Promise<void>;

  // Module is available (native binary loaded)
  isNative(): boolean;

  // Cleanup (free native resources)
  destroy(): void;
}

interface CryptoModule extends NativeModule {
  sha256(data: Buffer,): Buffer;
  blake3(data: Buffer,): Buffer;
  encrypt(data: Buffer, key: Buffer,): Buffer;
  decrypt(data: Buffer, key: Buffer,): Buffer;
}

interface ImageModule extends NativeModule {
  resize(data: Buffer, width: number, height: number,): Buffer;
  thumbnail(data: Buffer, size: number,): Buffer;
  transcode(data: Buffer, format: "webp" | "avif" | "jpeg",): Buffer;
}

interface CompressionModule extends NativeModule {
  compress(data: Buffer, level: number,): Buffer;
  decompress(data: Buffer,): Buffer;
  gzip(data: Buffer,): Buffer;
  gunzip(data: Buffer,): Buffer;
}
```

### Binary Distribution

Pre-compiled binaries are distributed per platform/architecture:

| Platform | Arch  | Binary Format           | FFI Symbol            |
| -------- | ----- | ----------------------- | --------------------- |
| Linux    | x64   | ELF shared object (.so) | `liblooploreso.so`    |
| Linux    | ARM64 | ELF shared object (.so) | `liblooploreso.so`    |
| macOS    | x64   | Mach-O dylib (.dylib)   | `liblooploreso.dylib` |
| macOS    | ARM64 | Mach-O dylib (.dylib)   | `liblooploreso.dylib` |
| Windows  | x64   | DLL (.dll)              | `looploreso.dll`      |
| Windows  | ARM64 | DLL (.dll)              | `looploreso.dll`      |

Binaries are downloaded at install time via a postinstall script:

```bash
# Install flow
bun install
# → postinstall: scripts/download-binaries.ts
# → Downloads liblooploreso.{so,dylib,dll} for current platform
# → Falls back to building from source if download fails
# → Falls back to pure JS if build fails
```

### Hot-Reload Mechanism

During development (`NODE_ENV=development`), modules hot-reload when the
source changes:

```typescript
// src/native/hot-reload.ts
class HotReloadManager {
  private watchers: Map<string, Watcher> = new Map();

  watch(modulePath: string, callback: () => void,): void {
    const watcher = Bun.file(modulePath,).watch((err,) => {
      if (err) { return; }
      // 1. Unload current binary
      this.unload(modulePath,);
      // 2. Rebuild if source changed
      this.rebuild(modulePath,);
      // 3. Reload binary
      this.load(modulePath,);
      // 4. Notify callback
      callback();
    },);
    this.watchers.set(modulePath, watcher,);
  }
}
```

### Security Model

- **Binary verification**: SHA-256 checksum + GPG signature verification
- **Sandboxing**: Native modules run in same process (no IPC isolation)
- **Capability model**: Modules declare required OS capabilities
- **Audit log**: All native module calls logged for security review

```typescript
interface ModuleManifest {
  name: string;
  version: string;
  binary: {
    url: string;
    sha256: string;
    gpg_signature?: string;
  };
  capabilities: ("filesystem" | "network" | "crypto" | "process")[];
  permissions: {
    filesystem?: { paths: string[] };
    network?: { hosts: string[] };
  };
}
```

### Fallback Strategy

If native binary is unavailable (wrong platform, download failed, etc.),
the module falls back to a pure-JS or WASM implementation:

```typescript
// src/native/crypto.ts
import { sha256JS, } from "./fallback/crypto";
import { sha256Native, } from "./native/crypto";

export function sha256(data: Buffer,): Buffer {
  if (sha256Native.isAvailable()) {
    return sha256Native.sha256(data,);
  }
  return sha256JS(data,);
}
```

## Implementation Phases

### Phase 1 — Module Infrastructure

- [ ] Define `NativeModule` interface and loader framework
- [ ] Implement binary download + verification (postinstall script)
- [ ] Implement hot-reload manager for development
- [ ] Add security manifest + capability checking
- [ ] Create pure-JS fallback framework

### Phase 2 — Crypto Module

- [ ] Implement SHA-256 (BLAKE3 preferred) native module
- [ ] Implement encryption/decryption (AES-256-GCM)
- [ ] Add pure-JS fallback (Web Crypto API)
- [ ] Add tests for correctness (native vs fallback parity)

### Phase 3 — Image Processing Module

- [ ] Implement resize + thumbnail (libvips or stb_image)
- [ ] Implement format transcode (WebP, AVIF)
- [ ] Add pure-JS fallback (Sharp.js or browser Canvas API)
- [ ] Add tests for image quality + performance

### Phase 4 — Compression Module

- [ ] Implement gzip + brotli + zstd
- [ ] Add pure-JS fallback (fflate, fzstd)
- [ ] Add tests for compression ratio + speed

### Phase 5 — ML Inference Module (Optional)

- [ ] Integrate ONNX Runtime for embedding generation
- [ ] Add pure-JS fallback (transformers.js)
- [ ] Add tests for model correctness

## Files (proposed)

- `src/native/loader.ts` — module loader + FFI binding
- `src/native/hot-reload.ts` — development hot-reload
- `src/native/security.ts` — binary verification + capability checking
- `src/native/modules/crypto.ts` — crypto native module
- `src/native/modules/image.ts` — image processing module
- `src/native/modules/compression.ts` — compression module
- `src/native/modules/ml.ts` — ML inference module
- `src/native/fallback/` — pure-JS fallbacks
- `scripts/download-binaries.ts` — postinstall binary download
- `scripts/build-binaries.ts` — build from source
- `native/` — C/C++ source for native modules
- `docs/native-modules.md` — documentation

## Open Questions

1. **FFI library:** Bun FFI vs `node:ffi-napi` vs N-API? Recommend Bun FFI (native to runtime).
2. **Build system:** CMake vs Make vs Zig? Recommend CMake for cross-platform.
3. **Distribution:** npm package with binaries vs separate binary package? Recommend single package with platform detection.
4. **ML inference:** ONNX Runtime vs TensorFlow Lite vs WebLLM? Recommend ONNX Runtime for broad model support.
5. **Security audit:** How often to audit native code? Recommend quarterly + CI scan.

## Dependencies

- Present: Bun runtime (FFI support), TypeScript
- New: C/C++ compiler toolchain (for building from source)
- New: CMake (build system)
- New: GPG (binary signature verification)
- Optional: ONNX Runtime (ML module)

## Testing Strategy

| Test        | Coverage                                    | Files                                     |
| ----------- | ------------------------------------------- | ----------------------------------------- |
| Unit        | Native vs fallback parity                   | `src/native/modules/*.test.ts`            |
| Integration | Binary download + verification              | `scripts/download-binaries.test.ts`       |
| Performance | Native vs JS speed comparison               | `tests/benchmarks/native-modules.test.ts` |
| Security    | Binary verification, capability enforcement | `src/native/security.test.ts`             |

## Related Epics

- **Epic Testing & Benchmarking** — performance benchmarks for native modules
- **Epic Headless & Alternative Frontends** — SDK distribution strategy
- **Epic Multi-Instance Reconciliation** — native module initialization in multi-instance

## Linked Tasks

- TASK-precompiled-hot-binaries.md
