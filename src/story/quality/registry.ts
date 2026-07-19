import { QualityDimension } from "../../db/enums";
import { scoreCharacterVoice } from "./scorers/character-voice";
import { scoreCreativity } from "./scorers/creativity";
import { scoreLoreConsistency } from "./scorers/lore-consistency";
import { scoreNarrativeQuality } from "./scorers/narrative-quality";
import { scorePlotCoherence } from "./scorers/plot-coherence";
import { scoreQuestRelevance } from "./scorers/quest-relevance";
import type { Scorer } from "./types";

export const SCORERS: Record<QualityDimension, Scorer> = {
  [QualityDimension.CharacterVoice]: scoreCharacterVoice,
  [QualityDimension.PlotCoherence]: scorePlotCoherence,
  [QualityDimension.LoreConsistency]: scoreLoreConsistency,
  [QualityDimension.NarrativeQuality]: scoreNarrativeQuality,
  [QualityDimension.QuestRelevance]: scoreQuestRelevance,
  [QualityDimension.Creativity]: scoreCreativity,
};
