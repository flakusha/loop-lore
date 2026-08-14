//! Integration tests — exercise the crate through its public C ABI surface
//! exactly as `src/native/loader.ts` calls it (the `#[no_mangle]` exports),
//! mirroring the parity tests in `src/native/blake3.test.ts`.

/// Official BLAKE3 test vectors (empty + short inputs).
const VECTORS: &[(&[u8], &str)] = &[
  (b"", "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"),
  (
    b"abc",
    "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85",
  ),
  (
    b"hello world",
    "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24",
  ),
];

fn hash_via_ffi(input: &[u8]) -> [u8; 32] {
  let mut out = [0u8; 32];
  let status = unsafe { loop_lore_native::ll_blake3(input.as_ptr(), input.len(), out.as_mut_ptr(), out.len()) };
  assert_eq!(status, 0);
  out
}

fn hex_encode(bytes: &[u8]) -> String {
  use std::fmt::Write;
  let mut hex = String::with_capacity(bytes.len() * 2);
  for byte in bytes {
    let _ = write!(hex, "{byte:02x}");
  }
  hex
}

#[test]
fn official_vectors_via_c_abi() {
  for (input, expected_hex) in VECTORS {
    let digest = hash_via_ffi(input);
    assert_eq!(hex_encode(&digest), *expected_hex);
  }
}

#[test]
fn multi_chunk_input_via_c_abi() {
  // 1024 × 'a' exercises the multi-chunk BLAKE3 path. Expected digest
  // cross-verified against @noble/hashes (independent implementation).
  let input = vec![b'a'; 1024];
  let digest = hash_via_ffi(&input);
  assert_eq!(
    hex_encode(&digest),
    "5a1c9e5d85d9898297037e8e24f69bb0e604a84c91c3b3ef4784a374812900d9"
  );
}
