// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified search — single umbrella for every search surface.
 *
 * Backend routes, the assistant, and chat context injection import the
 * service or the one-call conveniences; `src/frontend/` surfaces import the
 * pure helpers (`rank`, `config`) and the shared `types` for the same score
 * ranges and caps.
 */
export type { ResolvedTimeCap, SearchTimeCapConfig, TimeCapTier, } from "./config";
export { DEFAULT_GLOBAL_CAP, resolveTimeCap, } from "./config";
export type { ConvenienceOpts, } from "./convenience";
export { DEFAULT_SEARCH_CAPS, searchAssets, searchMemories, searchMessages, } from "./convenience";
export {
  deriveSearchTokens,
  MIN_TOKEN_LENGTH,
  TOKEN_HEX_LENGTH,
  tokenizeForSearch,
} from "./encrypted-tokens";
export type { AssetHit, } from "./providers/assets";
export { ASSET_FUZZY_CANDIDATE_CAP, createAssetProviders, } from "./providers/assets";
export type { MemoryHit, MemoryProviderOptions, } from "./providers/memories";
export { createMemoryProviders, } from "./providers/memories";
export type { MessageHit, MessageProviderOptions, } from "./providers/messages";
export { createMessageProviders, } from "./providers/messages";
export { bm25ToScore, fuzzyScore, reciprocalRankFusion, RRF_K, } from "./rank";
export type { ServiceOptions, ServiceProviders, UnifiedSearchService, } from "./service";
export { createUnifiedSearchService, } from "./service";
export type { TokenMatch, } from "./token-store";
export { deleteMessageTokens, matchMessageIdsByTokens, reindexMessageTokens, } from "./token-store";
export type {
  SearchHit,
  SearchMode,
  SearchOpts,
  SearchQuery,
  SearchScope,
  TierProvider,
} from "./types";
export { SearchTimeoutError, } from "./types";
