// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

//! C ABI exports for GGUF model probing.
//!
//! ABI contract (keep in sync with `src/frontend/alpine/gguf-probe.ts`):
//! - `ll_gguf_probe(data, len, out, out_len) -> i32` — validates the GGUF
//!   header, walks metadata + tensor infos (never tensor data), and writes
//!   a 32-byte summary into a caller-provided buffer:
//!   `version:u32 | 0:u32 | n_tensors:u64 | n_kv:u64 | 0:u32`.
//!   Returns 0 on success, -1 on bad args, -2 on bad magic,
//!   -3 on truncation, -4 on corrupt values.
//!
//! Safety model: all buffers are caller-allocated and validated before use.
//! Functions are non-panicking — FFI boundaries must never unwind.

use std::ptr;

/// GGUF magic ("GGUF" as little-endian bytes).
const GGUF_MAGIC: [u8; 4] = [0x47, 0x47, 0x55, 0x46];

/// Current GGUF version written by llama.cpp.
pub const GGUF_VERSION_CURRENT: u32 = 3;

/// Probe summary size in bytes (`version` + pad + `n_tensors` + `n_kv` + pad).
pub const GGUF_PROBE_LEN: usize = 32;

/// Upper bound for any single length prefix (strings, dims, counts).
/// Rejects absurd values before they can drive huge skips.
const MAX_SPAN: u64 = 1 << 32;

/// Little-endian cursor over the input with total bounds checking.
struct Cursor<'a> {
  bytes: &'a [u8],
  pos: usize,
}

impl<'a> Cursor<'a> {
  fn new(bytes: &'a [u8]) -> Self {
    Self { bytes, pos: 0 }
  }

  fn rest_len(&self) -> usize {
    self.bytes.len().saturating_sub(self.pos)
  }

  fn take(&mut self, len: usize) -> Option<&'a [u8]> {
    if len > self.rest_len() {
      return None;
    }
    let start = self.pos;
    self.pos += len;
    Some(&self.bytes[start..start + len])
  }

  fn u32(&mut self) -> Option<u32> {
    let raw = self.take(4)?;
    Some(u32::from_le_bytes([raw[0], raw[1], raw[2], raw[3]]))
  }

  fn u64(&mut self) -> Option<u64> {
    let raw = self.take(8)?;
    Some(u64::from_le_bytes([
      raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], raw[6], raw[7],
    ]))
  }

  fn skip(&mut self, len: u64) -> Option<()> {
    let advance = usize::try_from(len).ok()?;
    if len > MAX_SPAN || advance > self.rest_len() {
      return None;
    }
    self.pos += advance;
    Some(())
  }

  fn gguf_string(&mut self) -> Option<()> {
    let len = self.u64()?;
    self.skip(len)
  }
}

/// Skip one metadata value of the given GGUF type tag.
/// Array elements share the same tags (strings nest one level only).
fn skip_value(cursor: &mut Cursor, tag: u32) -> Option<()> {
  match tag {
    0 | 1 => cursor.skip(1),          // uint8 | int8
    2 | 3 => cursor.skip(2),          // uint16 | int16
    4..=7 => cursor.skip(4),     // uint32 | int32 | float32 | bool
    10..=12 => cursor.skip(8),   // uint64 | int64 | float64
    8 => cursor.gguf_string(),        // string
    9 => {
      let elem = cursor.u32()?;
      let count = cursor.u64()?;
      if count > MAX_SPAN {
        return None;
      }
      for _ in 0..count {
        // Element types are scalars or strings — never nested arrays.
        if elem == 9 {
          return None;
        }
        skip_value(&mut *cursor, elem)?;
      }
      Some(())
    }
    _ => None,
  }
}

/// Validate the header and walk metadata + tensor infos.
/// Returns `(version, n_tensors, n_kv)` on success.
fn probe(data: &[u8]) -> Result<(u32, u64, u64), i32> {
  let mut cursor = Cursor::new(data);
  let magic = cursor.take(4).ok_or(-3)?;
  if magic != GGUF_MAGIC {
    return Err(-2);
  }
  let version = cursor.u32().ok_or(-3)?;
  let n_tensors = cursor.u64().ok_or(-3)?;
  let n_kv = cursor.u64().ok_or(-3)?;
  if n_tensors > MAX_SPAN || n_kv > MAX_SPAN {
    return Err(-4);
  }
  for _ in 0..n_kv {
    cursor.gguf_string().ok_or(-3)?;
    let tag = cursor.u32().ok_or(-3)?;
    skip_value(&mut cursor, tag).ok_or(-4)?;
  }
  for _ in 0..n_tensors {
    cursor.gguf_string().ok_or(-3)?;
    let n_dims = cursor.u32().ok_or(-3)?;
    if n_dims > 4 {
      return Err(-4);
    }
    for _ in 0..n_dims {
      cursor.u64().ok_or(-3)?;
    }
    cursor.u32().ok_or(-3)?; // ggml type
    cursor.u64().ok_or(-3)?; // offset
  }
  Ok((version, n_tensors, n_kv))
}

/// Probe a GGUF model blob header.
///
/// # Safety
///
/// - `data` must point to `len` readable bytes (null only when `len` is 0,
///   which reads as truncation, never UB).
/// - `out` must point to `out_len >= 32` writable bytes.
///
/// Returns `0` on success, `-1` on bad args, `-2` on bad magic,
/// `-3` on truncation, `-4` on corrupt values.
#[no_mangle]
pub unsafe extern "C" fn ll_gguf_probe(
  data: *const u8,
  len: usize,
  out: *mut u8,
  out_len: usize,
) -> i32 {
  if out.is_null() || out_len < GGUF_PROBE_LEN {
    return -1;
  }
  let input: &[u8] = if data.is_null() || len == 0 {
    &[]
  } else {
    // SAFETY: caller contract guarantees `len` readable bytes at `data`.
    unsafe { std::slice::from_raw_parts(data, len) }
  };
  let (version, n_tensors, n_kv) = match probe(input) {
    Ok(summary) => summary,
    Err(code) => return code,
  };
  let mut summary = [0u8; GGUF_PROBE_LEN];
  summary[0..4].copy_from_slice(&version.to_le_bytes());
  summary[8..16].copy_from_slice(&n_tensors.to_le_bytes());
  summary[16..24].copy_from_slice(&n_kv.to_le_bytes());
  // SAFETY: `out` verified non-null and at least 32 bytes writable above.
  unsafe { ptr::copy_nonoverlapping(summary.as_ptr(), out, GGUF_PROBE_LEN) };
  0
}

#[cfg(test)]
mod tests {
  use super::*;

  /// Build a minimal valid GGUF blob: header + 1 string KV + 1 tensor.
  fn minimal_blob() -> Vec<u8> {
    let mut blob = Vec::new();
    blob.extend_from_slice(&GGUF_MAGIC);
    blob.extend_from_slice(&3u32.to_le_bytes()); // version
    blob.extend_from_slice(&1u64.to_le_bytes()); // n_tensors
    blob.extend_from_slice(&1u64.to_le_bytes()); // n_kv
    // KV: key "general.name", type string, value "tiny".
    blob.extend_from_slice(&12u64.to_le_bytes());
    blob.extend_from_slice(b"general.name");
    blob.extend_from_slice(&8u32.to_le_bytes());
    blob.extend_from_slice(&4u64.to_le_bytes());
    blob.extend_from_slice(b"tiny");
    // Tensor: name "w", 2 dims [8, 8], type F32 (0), offset 0.
    blob.extend_from_slice(&1u64.to_le_bytes());
    blob.extend_from_slice(b"w");
    blob.extend_from_slice(&2u32.to_le_bytes());
    blob.extend_from_slice(&8u64.to_le_bytes());
    blob.extend_from_slice(&8u64.to_le_bytes());
    blob.extend_from_slice(&0u32.to_le_bytes());
    blob.extend_from_slice(&0u64.to_le_bytes());
    blob
  }

  fn probe_out(blob: &[u8]) -> (i32, [u8; GGUF_PROBE_LEN]) {
    let mut out = [0u8; GGUF_PROBE_LEN];
    let status = unsafe { ll_gguf_probe(blob.as_ptr(), blob.len(), out.as_mut_ptr(), out.len()) };
    (status, out)
  }

  fn out_version(out: &[u8; GGUF_PROBE_LEN]) -> u32 {
    u32::from_le_bytes([out[0], out[1], out[2], out[3]])
  }

  fn out_u64(out: &[u8; GGUF_PROBE_LEN], at: usize) -> u64 {
    let s = &out[at..at + 8];
    u64::from_le_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]])
  }

  #[test]
  fn valid_blob_reports_summary() {
    let blob = minimal_blob();
    let (status, out) = probe_out(&blob);
    assert_eq!(status, 0);
    assert_eq!(out_version(&out), 3);
    assert_eq!(out_u64(&out, 8), 1);
    assert_eq!(out_u64(&out, 16), 1);
  }

  #[test]
  fn bad_magic_rejected() {
    let mut blob = minimal_blob();
    blob[0] = 0x00;
    let (status, _) = probe_out(&blob);
    assert_eq!(status, -2);
  }

  #[test]
  fn truncated_blob_rejected() {
    let blob = minimal_blob();
    for end in [0, 4, 10, 20, 40] {
      let (status, _) = probe_out(&blob[..end.min(blob.len())]);
      assert_eq!(status, -3, "prefix {end} must read as truncation");
    }
  }

  #[test]
  fn corrupt_type_tag_rejected() {
    let mut blob = minimal_blob();
    // Overwrite the KV type tag (offset 4+4+8+8+8+12=44) with 99.
    blob[44..48].copy_from_slice(&99u32.to_le_bytes());
    let (status, _) = probe_out(&blob);
    assert_eq!(status, -4);
  }

  #[test]
  fn short_out_buffer_rejected() {
    let blob = minimal_blob();
    let mut out = [0u8; 16];
    let status = unsafe { ll_gguf_probe(blob.as_ptr(), blob.len(), out.as_mut_ptr(), out.len()) };
    assert_eq!(status, -1);
    assert_eq!(out, [0u8; 16]);
  }

  #[test]
  fn null_out_rejected() {
    let blob = minimal_blob();
    let status =
      unsafe { ll_gguf_probe(blob.as_ptr(), blob.len(), std::ptr::null_mut(), GGUF_PROBE_LEN) };
    assert_eq!(status, -1);
  }

  #[test]
  fn array_kv_skipped() {
    let mut blob = Vec::new();
    blob.extend_from_slice(&GGUF_MAGIC);
    blob.extend_from_slice(&3u32.to_le_bytes());
    blob.extend_from_slice(&0u64.to_le_bytes());
    blob.extend_from_slice(&1u64.to_le_bytes());
    // KV: key "tags", type array-of-string ["a", "bb"].
    blob.extend_from_slice(&4u64.to_le_bytes());
    blob.extend_from_slice(b"tags");
    blob.extend_from_slice(&9u32.to_le_bytes());
    blob.extend_from_slice(&8u32.to_le_bytes());
    blob.extend_from_slice(&2u64.to_le_bytes());
    blob.extend_from_slice(&1u64.to_le_bytes());
    blob.extend_from_slice(b"a");
    blob.extend_from_slice(&2u64.to_le_bytes());
    blob.extend_from_slice(b"bb");
    let (status, out) = probe_out(&blob);
    assert_eq!(status, 0);
    assert_eq!(out_u64(&out, 16), 1);
  }
}
