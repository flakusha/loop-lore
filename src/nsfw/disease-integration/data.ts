import type {
  ContraceptionMethod,
  STD,
} from "../integration-schemas";

/** Common STDs in the game world */
export const COMMON_STDS: STD[] = [
  {
    id: "herpes",
    name: "Herpes",
    severity: 2,
    curable: false,
    symptoms: ["sores", "itching", "burning",],
  },
  {
    id: "syphilis",
    name: "Syphilis",
    severity: 3,
    curable: true,
    symptoms: ["rash", "fever", "fatigue",],
  },
  {
    id: "chlamydia",
    name: "Chlamydia",
    severity: 1,
    curable: true,
    symptoms: ["discharge", "burning_urination",],
  },
  {
    id: "gonorrhea",
    name: "Gonorrhea",
    severity: 2,
    curable: true,
    symptoms: ["discharge", "pain", "swelling",],
  },
  {
    id: "fantasy_ghoul_curse",
    name: "Ghoul's Touch",
    severity: 4,
    curable: false,
    symptoms: ["pallor", "craving", "sensitivity_to_light",],
  },
];

/** Common contraception methods */
export const COMMON_CONTRACEPTION: ContraceptionMethod[] = [
  {
    id: "condom",
    name: "Condom",
    effectiveness: 95,
    durationRemaining: 1, // Single use
  },
  {
    id: "potion",
    name: "Fertility Ward Potion",
    effectiveness: 99,
    durationRemaining: 24, // Hours
  },
  {
    id: "herb",
    name: "Moonpetal Herb",
    effectiveness: 80,
    durationRemaining: 12,
  },
  {
    id: "spell",
    name: "Sterility Ward",
    effectiveness: 100,
    durationRemaining: 48,
  },
];
