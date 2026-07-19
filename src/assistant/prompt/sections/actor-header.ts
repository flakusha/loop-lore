/**
 * Actor header section — the generating character's card
 * (name / description / personality / scenario).
 */
import type { SectionBuilder, } from "../types";

export const actorHeaderSection: SectionBuilder = {
  name: "actorHeader",
  enabled: () => true,
  build: (ctx,) => {
    const actor = ctx.actor;
    const headerParts: string[] = [];
    if (actor.display_name) { headerParts.push(`You are ${actor.display_name}.`,); }
    if (actor.description) { headerParts.push(`\nDescription: ${actor.description}`,); }
    if (actor.personality) { headerParts.push(`\nPersonality: ${actor.personality}`,); }
    if (actor.scenario) { headerParts.push(`\nScenario: ${actor.scenario}`,); }

    return headerParts.length > 0 ? [{ role: "system", content: headerParts.join("",), },] : [];
  },
};
