/**
 * Narrative Quality Regex Patterns
 *
 * Patterns for scoring narrative quality: dialogue detection, verb tense analysis,
 * action markers, first-person detection, entity extraction, and proper nouns.
 *
 * Sources: src/story/quality/scorers/*.ts, src/chat/hallucination-guard.ts
 */

/** Match dialogue quotes (straight and curly) */
export const DIALOGUE_QUOTES = /["\u{201C}\u{201D}]/gu;

/** Common past tense verbs for tense analysis */
export const PAST_VERBS = /\b(was|were|had|did|went|said|walked|looked|turned|spoke)\b/gi;

/** Common present tense verbs for tense analysis */
export const PRESENT_VERBS = /\b(is|are|has|do|go|say|walk|look|turn|speak)\b/gi;

/** Match action markers (text between asterisks: *attacks*) */
export const ACTION_MARKER = /\*.*\*/;

/** Match first-person pronouns */
export const FIRST_PERSON = /\b(I|me|my|mine|myself)\b/i;

/** Match capitalized proper nouns (2-5 words) */
export const PROPER_NOUN = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g;

/** Match proper nouns with word boundaries for entity detection */
export const PROPER_NOUN_ENTITY = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;

/** Match sentence-ending punctuation */
export const SENTENCE_END = /[.!?]+/;
