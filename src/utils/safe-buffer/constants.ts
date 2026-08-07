/**
 * Safe buffer default limits.
 */

/** Default max uncompressed size: 10 MB */
const DEFAULT_MAX_SIZE = 10_485_760;
/** Default max compression ratio (decompressed / compressed) */
const DEFAULT_MAX_RATIO = 1000;
/** Default max base64 input length (before decode) */
const DEFAULT_MAX_BASE64_LEN = 20_971_520; // 20 MB encoded

export { DEFAULT_MAX_BASE64_LEN, DEFAULT_MAX_RATIO, DEFAULT_MAX_SIZE, };
