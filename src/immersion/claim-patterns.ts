// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — Claim Patterns (WI-1)
 *
 * Compiled regex registries detecting movement, skill-use, item-interaction
 * and generic action claims in the actor message. Modelled on
 * `src/regex/story-events.ts` / `src/regex/transitions.ts`: closed pattern
 * lists, bounded captures with terminator anchors, shared module-level
 * RegExp objects always driven through `safeRegexExec` (lastIndex reset).
 *
 * Captures are lowercased + trimmed by the extractor before comparison;
 * patterns themselves stay case-insensitive.
 *
 * @module immersion/claim-patterns
 */

/** Claim-name body: letters/spaces/apostrophes/hyphens, bounded. */
const NAME = "[a-z][a-z\\s'-]{0,29}";
/** Capture tail guard: claim names end at clause boundaries. */
const NAME_END =
  "(?=\\s+(?:and|then|while|as|before|after|to|from|with|on|against|at|into|toward[s]?|through)\\b|[,.!?;:]|\\s*$)";

/**
 * Naive English gerund derivation for closed verb lists: e-drop
 * (leave→leaving) and final-consonant doubling (run→running). Deterministic
 * and covered by extract-claims tests; unknown forms simply do not match.
 */
function gerundForms(verbs: string,): string {
  return verbs.split("|",).map((v,) => {
    if (v.endsWith("e",)) {
      return v.slice(0, -1,) + "ing";
    }

    const last = v.charAt(v.length - 1,);
    if (/[bdgmnpt]/.test(last,) && v.length >= 3) {
      return v + last + "ing";
    }

    return v + "ing";
  },).join("|",);
}

/** First-person movement verbs (extends the src/regex/transitions family). */
const MOVE_VERBS = "sprint|run|dash|bolt|flee|escape|jog|stride|march|crawl|climb|swim" +
  "|step|slip|creep|wander|walk|move|go|head|leave|exit|travel|enter";

const MOVE_ALL = MOVE_VERBS + "|" + gerundForms(MOVE_VERBS,);

/** Generic attempted-action verbs (pending-failed-check constraints). */
const ACTION_VERBS = "attack|strike|break|force|push|shove|kick|pry|lift|carry|pull|climb" +
  "|jump|leap|vault|swim|dive|sneak|hide|pick|dodge|parry|block|grab|seize";

const ACTION_ALL = ACTION_VERBS + "|" + gerundForms(ACTION_VERBS,);

/** Subject prefix covering "I …", "we …", "I'm …", "we'll …". */
const SUBJECT = "\\b(?:i|we)(?:\\s+|(?:'m|'re|'ll))\\s*(?:(?:am|are|will)\\s+)?";

/**
 * First-person movement claims — "I sprint away", "we head north",
 * "I'm leaving", "we'll escape".
 */
export const MOVEMENT_CLAIM = new RegExp(
  SUBJECT + "(" + MOVE_ALL + ")s?\\b",
  "i",
);

/** Staged movement claims in roleplay asterisk actions — `*sprints away*`. */
export const STAGED_MOVEMENT_CLAIM = new RegExp(
  "\\*\\s*(" + MOVE_ALL + ")s?\\b[^*]{0,40}\\*",
  "i",
);

/** "use my acrobatics skill" / "trying my stealth skill". */
export const SKILL_NAMED_CLAIM = new RegExp(
  "\\b(?:use|used|using|try|trying|attempt(?:ing)?)\\s+(?:my\\s+|our\\s+)?(" +
    NAME + "?)\\s+skill\\b",
  "i",
);

/** "cast fireball" / "I cast healing word". */
export const SKILL_CAST_CLAIM = new RegExp(
  "\\b(?:i|we)\\s+cast\\s+(" + NAME + "?)(?:\\s+spell)?\\b",
  "i",
);

/** "I roll a perception check" / "make an investigation roll". */
export const SKILL_CHECK_CLAIM = new RegExp(
  "\\b(?:i|we)\\s+(?:roll|make)\\s+(?:an?\\s+)?(" + NAME + "?)\\s+(?:check|roll)\\b",
  "i",
);

/** "with my athletics training" / "thanks to my arcana expertise". */
export const SKILL_TRAIT_CLAIM = new RegExp(
  "\\bwith\\s+my\\s+(" + NAME + "?)\\s+(?:skill|training|expertise)\\b",
  "i",
);

/** Aggregate skill-claim patterns (bounded list per pipeline-hardening). */
export const SKILL_CLAIM_PATTERNS: readonly RegExp[] = [
  SKILL_NAMED_CLAIM,
  SKILL_CAST_CLAIM,
  SKILL_CHECK_CLAIM,
  SKILL_TRAIT_CLAIM,
];

/** "equip the sword" / "draw my dagger" / "don the amulet". */
export const ITEM_EQUIP_CLAIM = new RegExp(
  "\\b(?:equip(?:ping)?|don(?:ning)?|putting\\s+on|draw(?:s|ing|n)?|wield(?:s|ing)?" +
    "|unsheath(?:es|ing|ed)?|ready(?:ing)?)\\s+(?:the\\s+|my\\s+|our\\s+|an?\\s+)?(" +
    NAME + "?)" + NAME_END,
  "i",
);

/** "use the key" / "activate the amulet" — excludes trailing "skill" (skill rule). */
export const ITEM_USE_CLAIM = new RegExp(
  "\\b(?:use|using|activate|activating)\\s+(?:the\\s+|my\\s+|our\\s+|an?\\s+)?(" +
    NAME + "?)(?!\\s+skill\\b)" + NAME_END,
  "i",
);

/** "drink the potion" / "eat the ration" / "quaff the elixir". */
export const ITEM_CONSUME_CLAIM = new RegExp(
  "\\b(?:drink(?:s|ing)?|quaff(?:s|ing)?|eat(?:s|ing)?|consume(?:s|ing)?|swallow(?:s|ing)?)" +
    "\\s+(?:the\\s+|my\\s+|our\\s+|an?\\s+)?(" + NAME + "?)" + NAME_END,
  "i",
);

/** "attack with my axe" / "stabbing him with the dagger". */
export const ITEM_WIELD_ATTACK_CLAIM = new RegExp(
  "\\b(?:attack(?:ing)?|strike(?:ing)?|hit(?:ting)?|stab(?:bing)?|slash(?:ing)?" +
    "|shoot(?:ing)?|swing(?:ing)?)\\s+(?:(?:at|toward[s]?)\\s+)?(?:\\w+\\s+){0,2}with\\s+" +
    "(?:the\\s+|my\\s+|our\\s+|an?\\s+)?(" + NAME + "?)" + NAME_END,
  "i",
);

/** "read the scroll" / "reading the tome". */
export const ITEM_READ_CLAIM = new RegExp(
  "\\bread(?:s|ing)?\\s+(?:the\\s+|my\\s+|our\\s+|an?\\s+)?(" + NAME + "?)" + NAME_END,
  "i",
);

/** Item interaction kind for a matched {@link ITEM_CLAIM_PATTERNS} entry. */
type ItemPatternAction = "equip" | "use" | "consume" | "wield" | "read";

/** Aggregate item-claim patterns with their interaction kind. */
export const ITEM_CLAIM_PATTERNS: ReadonlyArray<readonly [RegExp, ItemPatternAction,]> = [
  [ITEM_EQUIP_CLAIM, "equip",],
  [ITEM_USE_CLAIM, "use",],
  [ITEM_CONSUME_CLAIM, "consume",],
  [ITEM_WIELD_ATTACK_CLAIM, "wield",],
  [ITEM_READ_CLAIM, "read",],
];

/**
 * Generic attempted-action claims — "I try to break the chains",
 * "I force the door". The pending-failed-check rule matches its
 * `blockedAction` keyword against these verbs.
 */
export const ACTION_CLAIM = new RegExp(
  SUBJECT + "(?:(?:try|attempt)\\s+to\\s+)?(" + ACTION_ALL + ")s?\\b",
  "i",
);

/** Staged generic-action claims — `*kicks the door*`. */
export const STAGED_ACTION_CLAIM = new RegExp(
  "\\*\\s*(" + ACTION_ALL + ")s?\\b[^*]{0,40}\\*",
  "i",
);

/** Aggregate action-claim patterns. */
export const ACTION_CLAIM_PATTERNS: readonly RegExp[] = [
  ACTION_CLAIM,
  STAGED_ACTION_CLAIM,
];

/** Aggregate movement-claim patterns. */
export const MOVEMENT_CLAIM_PATTERNS: readonly RegExp[] = [
  MOVEMENT_CLAIM,
  STAGED_MOVEMENT_CLAIM,
];
