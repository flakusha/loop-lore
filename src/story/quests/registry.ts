import type { ProgressCalculator, } from "./types";
import { QuestType, } from "../../db/enums";
import { calculateCollectionProgress, } from "./calculators/collection";
import { calculateCompositeProgress, } from "./calculators/composite";
import { calculateDestructionProgress, } from "./calculators/destruction";
import { calculateDiscoveryProgress, } from "./calculators/discovery";
import { calculateRescueProgress, } from "./calculators/rescue";
import { calculateSocialProgress, } from "./calculators/social";
import { calculateTimeProgress, } from "./calculators/time";

export const PROGRESS_CALCULATORS: Record<QuestType, ProgressCalculator> = {
  [QuestType.Destruction]: calculateDestructionProgress,
  [QuestType.Collection]: calculateCollectionProgress,
  [QuestType.Rescue]: calculateRescueProgress,
  [QuestType.Time]: calculateTimeProgress,
  [QuestType.Discovery]: calculateDiscoveryProgress,
  [QuestType.Social]: calculateSocialProgress,
  [QuestType.Composite]: calculateCompositeProgress,
};
