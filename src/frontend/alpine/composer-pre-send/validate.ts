// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  detectPassToken,
  extractMentionedActorIds,
  parseInitiativeFlag,
} from "../../../group-chat/mention-parser";
import type { PreSendValidation, } from "./send-gate";

/**
 * Validate a draft body without sending it.
 *
 * Runs the existing mention parser over the text, marks the
 * `[PASS]` opt-out, the `>>` initiative claim, and asset refs. Asset refs
 * are detected via the `asset:` prefix and checked against the
 * `pendingAssetIds` set so missing uploads are caught pre-send.
 * @param text
 * @param participants
 * @param pendingAssetIds
 */
export function validatePreSend(
  text: string,
  participants: { actorId: string; displayName: string }[],
  pendingAssetIds: string[],
): PreSendValidation {
  const trimmed = text.trim();
  const ok = trimmed.length > 0;
  const mentionedActorIds = extractMentionedActorIds(text, participants,);
  const resolvedNames = new Set(
    participants
      .filter((p,) => mentionedActorIds.includes(p.actorId,))
      .map((p,) => p.displayName.toLowerCase()),
  );
  const tokenRegex = /@([A-Za-z0-9_-]+)/g;
  const unresolvedMentions: string[] = [];
  let match = tokenRegex.exec(text,);
  while (match !== null) {
    const name = match[1]!;
    if (!resolvedNames.has(name.toLowerCase(),)) { unresolvedMentions.push(name,); }
    match = tokenRegex.exec(text,);
  }
  const { isInitiative, } = parseInitiativeFlag(text,);
  const knownAssets = new Set(pendingAssetIds,);
  const assetTokenRegex = /asset:([A-Za-z0-9-]+)/g;
  const unknownAssetRefs: string[] = [];
  let assetMatch = assetTokenRegex.exec(text,);
  while (assetMatch !== null) {
    if (!knownAssets.has(assetMatch[1]!,)) { unknownAssetRefs.push(assetMatch[1]!,); }
    assetMatch = assetTokenRegex.exec(text,);
  }
  return {
    ok,
    mentionedActorIds,
    unresolvedMentions: [...new Set(unresolvedMentions,),],
    isPassToken: detectPassToken(text,),
    isInitiativeClaim: isInitiative,
    unknownAssetRefs: [...new Set(unknownAssetRefs,),],
  };
}
