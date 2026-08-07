// ── Edit Templates ────────────────────────────────────────

import type { EditTemplate, } from "./types";

/** Predefined edit templates for common operations */
export const EDIT_TEMPLATES: EditTemplate[] = [
  // Background modifications
  {
    id: "bg-blur",
    name: "Blur Background",
    intent: "modify_background",
    promptModifier: "bokeh background, blurred background, depth of field",
    negativePrompt: "sharp background, flat",
    denoisingStrength: 0.6,
    controlNet: "depth",
  },
  {
    id: "bg-replace",
    name: "Replace Background",
    intent: "modify_background",
    promptModifier: "new background, detailed environment",
    negativePrompt: "original background",
    denoisingStrength: 0.85,
    controlNet: "segmentation",
  },
  {
    id: "bg-remove",
    name: "Remove Background",
    intent: "modify_background",
    promptModifier: "transparent background, isolated subject",
    denoisingStrength: 0.7,
    controlNet: "segmentation",
  },

  // Object operations
  {
    id: "obj-add",
    name: "Add Object",
    intent: "add_object",
    promptModifier: "added object, natural placement",
    denoisingStrength: 0.5,
    controlNet: "inpaint",
  },
  {
    id: "obj-remove",
    name: "Remove Object",
    intent: "remove_object",
    promptModifier: "clean background, removed object",
    denoisingStrength: 0.7,
    controlNet: "inpaint",
  },

  // Appearance changes
  {
    id: "hair-color",
    name: "Change Hair Color",
    intent: "change_hair",
    promptModifier: "colored hair, vibrant hair",
    denoisingStrength: 0.4,
    controlNet: "segmentation",
  },
  {
    id: "hair-style",
    name: "Change Hairstyle",
    intent: "change_hair",
    promptModifier: "new hairstyle, styled hair",
    denoisingStrength: 0.5,
    controlNet: "segmentation",
  },
  {
    id: "outfit-change",
    name: "Change Outfit",
    intent: "change_outfit",
    promptModifier: "new outfit, detailed clothing",
    denoisingStrength: 0.6,
    controlNet: "segmentation",
  },
  {
    id: "accessory-add",
    name: "Add Accessory",
    intent: "add_accessory",
    promptModifier: "with accessory, detailed",
    denoisingStrength: 0.35,
    controlNet: "inpaint",
  },

  // Mood/Expression
  {
    id: "mood-happy",
    name: "Happy Expression",
    intent: "adjust_mood",
    promptModifier: "happy expression, smiling, cheerful",
    denoisingStrength: 0.3,
    controlNet: "ip2p",
    ipAdapterStrength: 0.6,
  },
  {
    id: "mood-sad",
    name: "Sad Expression",
    intent: "adjust_mood",
    promptModifier: "sad expression, melancholy, downcast eyes",
    denoisingStrength: 0.3,
    controlNet: "ip2p",
    ipAdapterStrength: 0.6,
  },
  {
    id: "mood-angry",
    name: "Angry Expression",
    intent: "adjust_mood",
    promptModifier: "angry expression, furrowed brow, intense",
    denoisingStrength: 0.3,
    controlNet: "ip2p",
    ipAdapterStrength: 0.6,
  },

  // Lighting
  {
    id: "light-warm",
    name: "Warm Lighting",
    intent: "change_lighting",
    promptModifier: "warm lighting, golden hour, soft glow",
    denoisingStrength: 0.4,
    controlNet: "ip2p",
  },
  {
    id: "light-cold",
    name: "Cold Lighting",
    intent: "change_lighting",
    promptModifier: "cool lighting, blue tones, moonlight",
    denoisingStrength: 0.4,
    controlNet: "ip2p",
  },
  {
    id: "light-dramatic",
    name: "Dramatic Lighting",
    intent: "change_lighting",
    promptModifier: "dramatic lighting, rim light, cinematic",
    denoisingStrength: 0.45,
    controlNet: "ip2p",
  },

  // Styles
  {
    id: "style-anime",
    name: "Anime Style",
    intent: "apply_style",
    promptModifier: "anime style, cel shaded, vibrant colors",
    denoisingStrength: 0.6,
    controlNet: "canny",
  },
  {
    id: "style-realistic",
    name: "Realistic Style",
    intent: "apply_style",
    promptModifier: "photorealistic, detailed, high quality",
    denoisingStrength: 0.5,
    controlNet: "canny",
  },
  {
    id: "style-painting",
    name: "Painting Style",
    intent: "apply_style",
    promptModifier: "oil painting, painterly, art style",
    denoisingStrength: 0.6,
    controlNet: "canny",
  },

  // Pose
  {
    id: "pose-standing",
    name: "Standing Pose",
    intent: "change_pose",
    promptModifier: "standing pose, upright stance",
    denoisingStrength: 0.5,
    controlNet: "pose",
  },
  {
    id: "pose-sitting",
    name: "Sitting Pose",
    intent: "change_pose",
    promptModifier: "sitting pose, relaxed posture",
    denoisingStrength: 0.5,
    controlNet: "pose",
  },

  // Quality
  {
    id: "upscale-2x",
    name: "Upscale 2x",
    intent: "upscale",
    promptModifier: "high resolution, detailed, sharp",
    denoisingStrength: 0.2,
    controlNet: "tile",
    steps: 30,
  },
];
