// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import {
  calculateVisibility,
  type CombatWeather,
  createBattleTerrain,
  generateEnvironmentalHazard,
  getEnvironmentalModifiers,
  type TerrainType,
} from "../../battle";
import { SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, } from "../http-utils";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

export function weatherRoutes(_opts: HandlerOpts, prefix = "/api",) {
  return new Elysia({ name: "battle-weather", },)
    .post(
      `${prefix}/battle/weather/modifiers`,
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            weather: CombatWeather;
            terrain: TerrainType;
          };
          const terrainState = createBattleTerrain(body.terrain, body.weather,);
          const modifiers = getEnvironmentalModifiers(terrainState,);
          return jsonResponse(modifiers,);
        } catch (error) {
          log().error("Failed to get environmental modifiers", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Get environmental modifiers",
          description: "Get combat modifiers from weather and terrain.",
          tags: ["Battle", "Weather",],
        },
      },
    )
    .post(
      `${prefix}/battle/weather/visibility`,
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            weather: CombatWeather;
            timeOfDay: number;
          };
          const visibility = calculateVisibility(body.weather, body.timeOfDay,);
          return jsonResponse({ visibility, },);
        } catch (error) {
          log().error("Failed to calculate visibility", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Calculate visibility",
          description: "Calculate visibility based on weather and time of day.",
          tags: ["Battle", "Weather",],
        },
      },
    )
    .post(
      `${prefix}/battle/weather/hazard`,
      (ctx: any,) => {
        try {
          const body = ctx.body as {
            terrain: TerrainType;
            weather: CombatWeather;
          };
          const hazard = generateEnvironmentalHazard(body.terrain, body.weather,);
          return jsonResponse(hazard,);
        } catch (error) {
          log().error("Failed to generate hazard", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }
      },
      {
        response: { 200: SuccessResponse, },
        detail: {
          summary: "Generate environmental hazard",
          description: "Generate a random environmental hazard from terrain and weather.",
          tags: ["Battle", "Weather",],
        },
      },
    );
}
