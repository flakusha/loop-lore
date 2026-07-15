import { QualityDimension } from "../../db/enums";
import type { Scorer } from "./types";
import { scoreCharacterVoice } from "./scorers/character-voice";
import { scorePlotCoherence } from "./scorers/plot-coherence";
import { scoreLoreConsistency } from "./scorers/lore-consistency";
import { scoreNarrativeQuality } from "./scorers/narrative-quality";
import { scoreQuestRelevance } from "./scorers/quest-relevance";
import { scoreCreativity } from "./scorers/creativity";

export const SCORERS: Record<QualityDimension, Scorer> = {
  [QualityDimension.CharacterVoice]: scoreCharacterVoice,
  [QualityDimension.PlotCoherence]: scorePlotCoherence,
  [QualityDimension.LoreConsistency]: scoreLoreConsistency,
  [QualityDimension.NarrativeQuality]: scoreNarrativeQuality,
  [QualityDimension.QuestRelevance]: scoreQuestRelevance,
  [QualityDimension.Creativity]: scoreCreativity,
};
