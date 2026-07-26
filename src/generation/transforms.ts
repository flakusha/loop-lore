import type { RegexTransform, } from "../config/schema";

export interface TransformResult {
  text: string;
  applied: { name: string; pattern: string; matches: number }[];
}

/**
 * Apply regex transforms to LLM output text.
 * Transforms are applied in order; each tracks match count.
 */
export function applyRegexTransforms(
  text: string,
  transforms: RegexTransform[],
): TransformResult {
  const applied: TransformResult["applied"] = [];
  let current = text;

  for (const t of transforms) {
    if (!t.enabled) { continue; }
    try {
      const regex = new RegExp(t.pattern, t.flags ?? "g",);
      const matches = current.match(regex,);
      if (matches && matches.length > 0) {
        applied.push({ name: t.name, pattern: t.pattern, matches: matches.length, },);
        // eslint-disable-next-line unicorn/no-unsafe-string-replacement -- user-configured replacement strings are the feature
        current = current.replace(regex, t.replacement,);
      }
    } catch {
      // Skip invalid regex patterns
    }
  }

  return { text: current, applied, };
}
