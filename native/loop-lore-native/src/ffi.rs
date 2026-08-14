//! C ABI exports for the BLAKE3 sample module.
//!
//! ABI contract (keep in sync with `src/native/loader.ts`):
//! - `ll_version() -> i32` — packed `(major << 16) | (minor << 8) | patch`.
//! - `ll_blake3(data, len, out, out_len) -> i32` — writes 32 digest bytes
//!   into a caller-provided buffer; returns 0 on success, -1 on bad args.
//!
//! Safety model: all buffers are caller-allocated and validated before use.
//! Functions are non-panicking — FFI boundaries must never unwind.

use crate::BLAKE3_LEN;
use crate::VERSION;
use std::ptr;

/// Returns the ABI version. An `i32` (not a pointer) keeps C-string handling
/// entirely out of the FFI contract.
#[no_mangle]
pub extern "C" fn ll_version() -> i32 {
  VERSION
}

/// BLAKE3 hash of `data`, written into `out`.
///
/// # Safety
///
/// - `data` must point to `len` readable bytes (may be null only when `len`
///   is 0 — the empty input hashes to the BLAKE3 empty digest).
/// - `out` must point to `out_len >= 32` writable bytes.
///
/// Returns `0` on success, `-1` when `out` is null or `out_len < 32`.
/// Null/undersized inputs are rejected *before* any dereference, so this
/// function cannot cause UB from mis-sized buffers.
#[no_mangle]
pub unsafe extern "C" fn ll_blake3(data: *const u8, len: usize, out: *mut u8, out_len: usize) -> i32 {
  if out.is_null() || out_len < BLAKE3_LEN {
    return -1;
  }
  let input: &[u8] = if data.is_null() || len == 0 {
    &[]
  } else {
    // SAFETY: caller contract guarantees `len` readable bytes at `data`.
    // A non-null pointer with `len > 0` is dereferenced below by blake3.
    unsafe { std::slice::from_raw_parts(data, len) }
  };
  let digest = blake3::hash(input);
  // SAFETY: `out` verified non-null and at least 32 bytes writable above.
  unsafe { ptr::copy_nonoverlapping(digest.as_bytes().as_ptr(), out, BLAKE3_LEN) };
  0
}

#[cfg(test)]
mod tests {
  use super::*;

  /// Official BLAKE3 test vectors (from the BLAKE3 spec / reference impl).
  const VECTORS: &[(&[u8], &str)] = &[
    (b"", "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"),
    (b"a", "17762fddd969a453925d65717ac3eea21320b66b54342fde15128d6caf21215f"),
    (
      b"abc",
      "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85",
    ),
    (
      b"hello world",
      "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
    ),
  ];

  fn hash(input: &[u8]) -> [u8; BLAKE3_LEN] {
    let mut out = [0u8; BLAKE3_LEN];
    let status = unsafe { ll_blake3(input.as_ptr(), input.len(), out.as_mut_ptr(), out.len()) };
    assert_eq!(status, 0, "ll_blake3 must succeed for well-formed inputs");
    out
  }

  #[test]
  fn vectors_match() {
    for (input, expected_hex) in VECTORS {
      let actual = hex_encode(&hash(input));
      assert_eq!(
        actual,
        *expected_hex,
        "vector mismatch for {:?}",
        String::from_utf8_lossy(input)
      );
    }
  }

  #[test]
  fn null_data_hashes_empty_input() {
    // A null pointer with len 0 is the empty slice — BLAKE3 empty digest.
    let mut out = [0u8; BLAKE3_LEN];
    let status = unsafe { ll_blake3(std::ptr::null(), 0, out.as_mut_ptr(), out.len()) };
    assert_eq!(status, 0);
    assert_eq!(hex_encode(&out), VECTORS[0].1);
  }

  #[test]
  fn short_buffer_rejected() {
    let data = b"abc";
    let mut out = [0u8; 16];
    let status = unsafe { ll_blake3(data.as_ptr(), data.len(), out.as_mut_ptr(), out.len()) };
    assert_eq!(status, -1);
    // Nothing must have been written into the undersized buffer.
    assert_eq!(out, [0u8; 16]);
  }

  #[test]
  fn null_out_rejected() {
    let data = b"abc";
    let status = unsafe { ll_blake3(data.as_ptr(), data.len(), std::ptr::null_mut(), BLAKE3_LEN) };
    assert_eq!(status, -1);
  }

  #[test]
  fn version_is_packed() {
    assert_eq!(ll_version(), 512); // 0.2.0 → (0 << 16) | (2 << 8) | 0
  }

  #[test]
  fn output_is_stable_across_calls() {
    let input = b"deterministic output";
    assert_eq!(hash(input), hash(input), "BLAKE3 must be deterministic");
  }

  #[test]
  fn large_input_hashes() {
    // 1 MiB of patterned bytes — exercises multi-chunk BLAKE3 path.
    let input: Vec<u8> = (0..1_048_576u32).map(|i| (i % 251) as u8).collect();
    let digest = hash(&input);
    // Cross-check against the blake3 crate's own high-level API.
    let reference = blake3::hash(&input);
    assert_eq!(digest.as_slice(), reference.as_bytes());
  }

  fn hex_encode(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut hex = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
      let _ = write!(hex, "{byte:02x}");
    }
    hex
  }
}
