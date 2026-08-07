import type { VnTemplate, } from "../template-engine";
import { SCENE_TEMPLATES, } from "./scene-templates";

export function getSceneTemplate(id: string,): VnTemplate | undefined {
  return SCENE_TEMPLATES.find((t,) => t.id === id);
}

export function listSceneTemplates(): VnTemplate[] {
  return [...SCENE_TEMPLATES,];
}
