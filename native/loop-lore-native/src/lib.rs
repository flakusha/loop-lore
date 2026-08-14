//! # loop-lore-native
//!
//! Native BLAKE3 + zstd modules for loop-lore — the **integration samples**
//! for pre-compiled hot binary components.
//!
//! The crate compiles to a `cdylib` (`.so` / `.dylib` / `.dll`) exposing a
//! stable C ABI consumed by [`src/native/loader.ts`] via Bun FFI
//! (`bun:ffi` dlopen). The TypeScript layer calls these symbols and falls
//! back to pure-TS/Bun-native implementations when the binary is
//! unavailable (wrong platform, missing build, dlopen failure, ABI drift).
//!
//! Build-stage model: `bun run build:native` compiles the crate when a Rust
//! toolchain exists; when it does not, the TS implementation is the default.
//! Compiled artifacts live under the crate's `target/` dir, which is
//! gitignored — binaries are never committed.
//!
//! [`src/native/loader.ts`]: https://github.com/loop-lore/loop-lore/blob/dev/src/native/loader.ts

/// BLAKE3 digest length in bytes (256-bit output).
pub const BLAKE3_LEN: usize = 32;

/// Library ABI version — packed `(major << 16) | (minor << 8) | patch`.
///
/// Bumped 0.1.0 → 0.2.0 when the zstd symbol family was added; the loader
/// rejects a binary whose version differs from its own
/// `REQUIRED_ABI_VERSION`, degrading to the TS fallback instead of
/// misbehaving silently across an ABI boundary.
// clippy: identity_op — the expanded form mirrors the TS loader's
// `REQUIRED_ABI_VERSION` expression exactly; keep the two in lockstep.
#[allow(clippy::identity_op)]
pub const VERSION: i32 = (0 << 16) | (2 << 8) | 0;

/// C ABI exports — [`ffi`] (BLAKE3) and [`zstd`] (compression).
///
/// Every symbol uses caller-provided buffers; no allocation crosses the FFI
/// boundary.
pub mod ffi;
pub mod zstd;

pub use ffi::ll_blake3;
pub use ffi::ll_version;
pub use zstd::{ll_zstd_compress, ll_zstd_decompress, ll_zstd_decompress_bound};
