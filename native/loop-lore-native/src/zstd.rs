//! C ABI exports for the zstd compression module.
//!
//! ABI contract (keep in sync with `src/native/loader.ts`):
//! - `ll_zstd_compress(data, len, out, out_cap, level) -> i32` — zstd frame
//!   into a caller-provided buffer; returns compressed size ≥ 0, or a
//!   negative error code.
//! - `ll_zstd_decompress(data, len, out, out_cap) -> i32` — returns
//!   decompressed size, or a negative error code.
//! - `ll_zstd_decompress_bound(data, len) -> i64` — frame content size for
//!   allocating the output buffer; -1 when unknown/corrupt.
//!
//! Determinism: a fixed `level` produces byte-identical output for the same
//! input — the property the memory/text-compression use case relies on
//! (stable frames enable content-addressing + dedup).
//!
//! Error codes: `-1` bad args (null / zero capacity), `-2` compression
//! failure, `-3` decompression failure (incl. output too small / corrupt
//! frame), `-4` unsupported compression level.
//!
//! Safety model: caller-provided buffers validated before use; functions
//! never unwind across the FFI boundary.

/// Error code — invalid arguments (null pointer / zero capacity).
pub const ERR_ARGS: i32 = -1;
/// Error code — compression failed.
pub const ERR_COMPRESS: i32 = -2;
/// Error code — decompression failed (too-small output, corrupt frame).
pub const ERR_DECOMPRESS: i32 = -3;
/// Error code — unsupported compression level.
pub const ERR_LEVEL: i32 = -4;

/// zstd-compress `data` into `out` at `level` (1–22, or 0 = default).
///
/// # Safety
///
/// - `data` must point to `len` readable bytes (null only when `len` is 0).
/// - `out` must point to `out_cap` writable bytes; `out_cap` must be > 0.
///
/// Returns the compressed size (≥ 0), or a negative error code.
#[no_mangle]
pub unsafe extern "C" fn ll_zstd_compress(
  data: *const u8,
  len: usize,
  out: *mut u8,
  out_cap: usize,
  level: i32,
) -> i32 {
  if out.is_null() || out_cap == 0 {
    return ERR_ARGS;
  }
  if !(0..=22).contains(&level) {
    return ERR_LEVEL;
  }
  let input: &[u8] = unsafe {
    if data.is_null() || len == 0 {
      &[]
    } else {
      // SAFETY: caller contract guarantees `len` readable bytes at `data`.
      std::slice::from_raw_parts(data, len)
    }
  };
  let out_slice = unsafe { std::slice::from_raw_parts_mut(out, out_cap) };
  let Ok(compressed_len) = zstd::bulk::compress_to_buffer(input, out_slice, level) else {
    return ERR_COMPRESS; // output buffer too small, or compression failure
  };
  let Ok(compressed_len) = i32::try_from(compressed_len) else {
    return ERR_COMPRESS;
  };
  compressed_len
}

/// zstd-decompress `data` into `out` (capacity must cover the frame size).
///
/// # Safety
///
/// - `data` must point to `len` readable bytes.
/// - `out` must point to `out_cap` writable bytes; `out_cap` > 0.
///
/// Returns the decompressed size (≥ 0), or a negative error code. Use
/// [`ll_zstd_decompress_bound`] to size the output buffer.
#[no_mangle]
pub unsafe extern "C" fn ll_zstd_decompress(data: *const u8, len: usize, out: *mut u8, out_cap: usize) -> i32 {
  if out.is_null() || out_cap == 0 {
    return ERR_ARGS;
  }
  let input: &[u8] = unsafe {
    if data.is_null() || len == 0 {
      return ERR_ARGS; // empty compressed frame is invalid
    }
    // SAFETY: caller contract guarantees `len` readable bytes at `data`.
    std::slice::from_raw_parts(data, len)
  };
  let out_slice = unsafe { std::slice::from_raw_parts_mut(out, out_cap) };
  match zstd::bulk::decompress_to_buffer(input, out_slice) {
    Ok(size) => i32::try_from(size).unwrap_or(ERR_DECOMPRESS),
    Err(_) => ERR_DECOMPRESS,
  }
}

/// Frame content size for output-buffer allocation.
///
/// Returns the decompressed size (≥ 0), or -1 when unknown/corrupt.
///
/// # Safety
///
/// `data` must point to `len` readable bytes (null only when `len` is 0).
#[no_mangle]
pub unsafe extern "C" fn ll_zstd_decompress_bound(data: *const u8, len: usize) -> i64 {
  if data.is_null() || len == 0 {
    return -1;
  }
  let input: &[u8] = unsafe {
    // SAFETY: caller contract guarantees `len` readable bytes at `data`.
    std::slice::from_raw_parts(data, len)
  };
  match zstd::zstd_safe::get_frame_content_size(input) {
    Ok(Some(size)) => i64::try_from(size).unwrap_or(-1),
    Ok(None) | Err(_) => -1,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn compress(input: &[u8], level: i32) -> Vec<u8> {
    let mut out = vec![0u8; input.len() + 1024];
    let status = unsafe { ll_zstd_compress(input.as_ptr(), input.len(), out.as_mut_ptr(), out.len(), level) };
    assert!(status >= 0, "compress failed with {status}");
    out.truncate(usize::try_from(status).expect("status >= 0"));
    out
  }

  fn decompress(frame: &[u8], capacity: usize) -> Vec<u8> {
    let mut out = vec![0u8; capacity];
    let status = unsafe { ll_zstd_decompress(frame.as_ptr(), frame.len(), out.as_mut_ptr(), out.len()) };
    assert!(status >= 0, "decompress failed with {status}");
    out.truncate(usize::try_from(status).expect("status >= 0"));
    out
  }

  #[test]
  fn roundtrip() {
    let input = b"hello world - deterministic compression";
    let frame = compress(input, 3);
    assert_eq!(decompress(&frame, 64), input);
  }

  #[test]
  fn deterministic_output_per_level() {
    // The compression contract: a fixed level yields byte-identical frames
    // (the property deterministic memory/text compression relies on).
    let input = [0u8, 1, 2, 3].repeat(1024);
    let a = compress(&input, 3);
    let b = compress(&input, 3);
    assert_eq!(a, b, "fixed level must produce byte-identical frames");
  }

  #[test]
  fn higher_level_never_worse() {
    // zstd guarantee: level 19 compresses at least as well as level 1.
    // (Byte equality across levels is data-dependent and NOT part of the
    // ABI contract — zstd's greedy match is already optimal for highly
    // redundant inputs at low levels.)
    let input = [0u8, 1, 2, 3].repeat(1024);
    let level1 = compress(&input, 1);
    let level19 = compress(&input, 19);
    assert!(
      level19.len() <= level1.len(),
      "level 19 must not compress worse than level 1 ({} > {})",
      level19.len(),
      level1.len()
    );
  }

  #[test]
  fn empty_input_roundtrips() {
    let frame = compress(b"", 3);
    assert_eq!(decompress(&frame, 16), b"");
  }

  #[test]
  fn large_input_roundtrips() {
    let input: Vec<u8> = (0..1_048_576u32).map(|i| (i % 251) as u8).collect();
    let frame = compress(&input, 6);
    assert!(frame.len() < input.len() / 2, "patterned data must compress well");
    assert_eq!(decompress(&frame, input.len()), input);
  }

  #[test]
  fn decompress_bound_matches_content_size() {
    let input = b"bound check";
    let frame = compress(input, 3);
    let bound = unsafe { ll_zstd_decompress_bound(frame.as_ptr(), frame.len()) };
    assert_eq!(bound, i64::try_from(input.len()).unwrap());
  }

  #[test]
  fn bad_args_rejected() {
    let input = b"data";
    // null out buffer
    let status = unsafe { ll_zstd_compress(input.as_ptr(), input.len(), std::ptr::null_mut(), 16, 3) };
    assert_eq!(status, ERR_ARGS);
    // zero capacity
    let mut out = [];
    let status = unsafe { ll_zstd_compress(input.as_ptr(), input.len(), out.as_mut_ptr(), 0, 3) };
    assert_eq!(status, ERR_ARGS);
    // level out of range
    let mut out = [0u8; 64];
    let status = unsafe { ll_zstd_compress(input.as_ptr(), input.len(), out.as_mut_ptr(), 64, 23) };
    assert_eq!(status, ERR_LEVEL);
  }

  #[test]
  fn too_small_output_buffer_fails() {
    let input = b"frame larger than buffer";
    let frame = compress(input, 3);
    let mut out = [0u8; 4];
    let status = unsafe { ll_zstd_decompress(frame.as_ptr(), frame.len(), out.as_mut_ptr(), out.len()) };
    assert_eq!(status, ERR_DECOMPRESS);
  }

  #[test]
  fn corrupt_frame_rejected() {
    let mut out = [0u8; 64];
    let status = unsafe { ll_zstd_decompress([0xde, 0xad, 0xbe, 0xef].as_ptr(), 4, out.as_mut_ptr(), 64) };
    assert_eq!(status, ERR_DECOMPRESS);
  }

  #[test]
  fn version_is_packed_030() {
    assert_eq!(crate::VERSION, 768); // 0.3.0 → (0 << 16) | (3 << 8) | 0
  }
}
