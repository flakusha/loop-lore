import { QuestType } from "../../db/enums";
import type { ProgressCalculator } from "./types";
import { calculateDestructionProgress } from "./calculators/destruction";
import { calculateCollectionProgress } from "./calculators/collection";
import { calculateRescueProgress } from "./calculators/rescue";
import { calculateTimeProgress } from "./calculators/time";
import { calculateDiscoveryProgress } from "./calculators/discovery";
import { calculateSocialProgress } from "./calculators/social";
import { calculateCompositeProgress } from "./calculators/composite";

export const PROGRESS_CALCULATORS: Record<QuestType, ProgressCalculator> = {
  [QuestType.Destruction]: calculateDestructionProgress,
  [QuestType.Collection]: calculateCollectionProgress,
  [QuestType.Rescue]: calculateRescueProgress,
  [QuestType.Time]: calculateTimeProgress,
  [QuestType.Discovery]: calculateDiscoveryProgress,
  [QuestType.Social]: calculateSocialProgress,
  [QuestType.Composite]: calculateCompositeProgress,
};
