// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { listTimelineEntries, } from "../../story/timeline/world-timeline";
import type { TimelineEntry, } from "../../story/timeline/world-timeline";
import { can, } from "../../users/permissions";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import { requireWorldAccess, } from "../worlds/access";
import { escapeHtml, htmlResponse, } from "./layout";
import { loadWorldListCards, renderWorldCard, } from "./worlds-list";

/**
 * @param raw
 */
function parseFeaturesJson(raw: string | null,): string[] {
  if (!raw) { return []; }
  const parsed = safeJsonParse(raw,);
  return parsed.ok && Array.isArray(parsed.value,)
    ? Array.from(parsed.value, String,)
    : [];
}

/**
 * @param database
 * @param userId
 * @param userRole
 * @returns the worlds list HTML fragment for this viewer
 */
async function serveWorldsListDb(
  database: Kysely<DB>,
  userId: string | null,
  userRole: string | null,
): Promise<Response> {
  let qb = database.selectFrom("worlds",).selectAll().orderBy("name", "asc",).limit(100,);
  // Non-admin users only see their own worlds (mirrors GET /api/worlds).
  if (userId && !can(userRole, "admin.world",)) {
    qb = qb.where("owner_id", "=", userId,);
  }

  const worlds = await qb.execute();

  if (worlds.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">🌍</div>
      <div class="title">No worlds found</div>
      <div class="description">Create your first world.</div>
    </div>`,);
  }

  const items = (await loadWorldListCards(database, worlds,))
    .map((card,) => renderWorldCard(card, Date.now(),))
    .join("",);

  return htmlResponse(items,);
}

/**
 * Render the branch-scoped timeline events block for the detail fragment.
 * @param events
 * @param branchName
 */
function renderTimelineEvents(events: TimelineEntry[], branchName: string | null,): string {
  const heading = `Timeline events${branchName ? ` — ${escapeHtml(branchName,)}` : ""}`;
  if (events.length === 0) {
    return `<div class="form-group" style="margin-bottom:var(--space-6)">
      <label class="form-label">${heading}</label>
      <div class="empty-state" style="padding: var(--space-4); font-size: 13px">No timeline events on this branch</div>
    </div>`;
  }

  const rows = events
    .map(
      (entry,) =>
        `<div class="timeline-event">
        <span class="timeline-event-date">${escapeHtml(entry.occurred_at.slice(0, 10,),)}</span>
        <span class="timeline-event-desc">${escapeHtml(entry.description,)}</span>
      </div>`,
    )
    .join("",);

  return `<div class="form-group" style="margin-bottom:var(--space-6)">
    <label class="form-label">${heading}</label>
    <div class="timeline-events">${rows}</div>
  </div>`;
}

/**
 * @param worldId
 * @param database
 * @param userId
 * @param userRole
 * @param timelineId — branch to scope events to. Must belong to this world;
 *   unknown/absent falls back to the conventional `prime` branch.
 * @returns the world detail HTML fragment, empty-state when access is denied
 */
async function serveWorldDetailContent(
  worldId: string,
  database: Kysely<DB>,
  userId: string | null,
  userRole: string | null,
  timelineId?: string | null,
): Promise<Response> {
  const world = await database.selectFrom("worlds",).selectAll().where("id", "=", worldId,).executeTakeFirst();

  // Mirror the API: owner, admin, member, or public-visibility may view.
  // requireWorldAccess hides existence (World not found) from outsiders.
  if (!world) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">World not found</div>
    </div>`,);
  }

  if (await requireWorldAccess(database, worldId, userId, userRole,)) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">World not found</div>
    </div>`,);
  }

  const name = escapeHtml(world.name,);
  const desc = escapeHtml(world.description || "",);
  const lore = escapeHtml(world.lore || "",);

  // Resolve the branch to render. An unknown or foreign timeline id silently
  // falls back to `prime` (the event-table slug default): a fragment must not
  // 404, and a foreign id must not leak branch existence.
  let branchName: string | null = null;
  let eventTimeline = "prime";
  if (timelineId) {
    const branch = await database
      .selectFrom("world_timelines",)
      .select(["id", "name", "is_prime",],)
      .where("id", "=", timelineId,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    if (branch) {
      branchName = branch.name;
      // Prime events carry the `prime` slug even when the world_timelines row
      // has a uuid id; fork events carry the fork row's id.
      eventTimeline = branch.is_prime ? "prime" : branch.id;
    }
  }

  const timelineEvents = await listTimelineEntries({
    db: database,
    worldId,
    timelineId: eventTimeline,
    limit: 50,
  },);

  const locations = await database
    .selectFrom("locations",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .orderBy("name", "asc",)
    .execute();

  // Chat setup templates for the location-creation dropdown (default `world`).
  const templates = await database
    .selectFrom("chat_setup_templates",)
    .select(["id", "slug", "name", "description", "features",],)
    .orderBy("name", "asc",)
    .execute();

  const templatesJson = jsonStringifyOr(
    Array.from(templates, (t,) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      features: parseFeaturesJson(t.features,),
    }),),
    "[]",
  );

  // Resolve each location's bound public chat template for the non-default
  // badge. A location is "default" when its public chat binds `template-world`.
  const worldChats = await database
    .selectFrom("chats",)
    .select(["current_location_id", "template_id",],)
    .where("world_id", "=", worldId,)
    .where("visibility", "=", "public",)
    .execute();

  const templateNames = new Map<string, string>(
    Array.from(templates, (t,) => [t.id, t.name,],),
  );

  const locationTemplate = new Map<string, { name: string; isDefault: boolean }>();
  for (const chat of worldChats) {
    if (!chat.current_location_id) { continue; }
    const isDefault = chat.template_id === "template-world";
    const tid = chat.template_id && templateNames.has(chat.template_id,)
      ? chat.template_id
      : null;

    locationTemplate.set(chat.current_location_id, {
      name: tid ? templateNames.get(tid,)! : "custom",
      isDefault,
    },);
  }

  const locationsJson = jsonStringifyOr(
    Array.from(locations, (l,) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      world_id: l.world_id,
      templateName: locationTemplate.get(l.id,)?.name ?? null,
      templateIsDefault: locationTemplate.get(l.id,)?.isDefault ?? false,
    }),),
    "[]",
  );

  return htmlResponse(
    `<div style="max-width:800px;margin:0 auto" x-data="worldDetail({ worldId: '${escapeHtml(worldId,)}', locations: ${
      escapeHtml(locationsJson,)
    }, templates: ${escapeHtml(templatesJson,)} })">
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <h2>${name}</h2>
        <p class="description">${desc}</p>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <label class="form-label">Lore</label>
        <div class="lore-content">${lore}</div>
      </div>
      ${renderTimelineEvents(timelineEvents, branchName,)}
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3)">
          <label class="form-label" style="margin: 0" x-text="'Locations (' + locationCount + ')'"></label>
          <div style="display: flex; gap: var(--space-2)">
            <button class="btn btn-secondary btn-xs" @click="showCreateLocation = !showCreateLocation" x-text="showCreateLocation ? 'Cancel' : '+ Add'"></button>
            <button class="btn btn-secondary btn-xs" @click="initializeStates()">Init States</button>
          </div>
        </div>
        <div x-show="showCreateLocation" style="margin-bottom: var(--space-3); padding: var(--space-3); background: var(--bg-secondary, #f8f9fa); border-radius: 4px; border: 1px solid var(--border-default, #e9ecef)">
          <div style="display: grid; gap: var(--space-2)">
            <input class="form-input" style="font-size: 13px" x-model="newLocationName" placeholder="Location name" />
            <input class="form-input" style="font-size: 13px" x-model="newLocationDesc" placeholder="Description (optional)" />
            <label class="form-label" style="font-size: 12px; margin: 0">Chat template</label>
            <select class="form-select" style="font-size: 13px" x-model="newLocationTemplateId" @change="onTemplateChange()">
              <template x-for="t in templates" :key="t.id">
                <option :value="t.id" x-text="t.name"></option>
              </template>
            </select>
            <div x-show="newLocationTemplateFeatures.length > 0" style="font-size: 12px; color: var(--text-secondary)">
              <div style="font-weight: 600; margin-bottom: 2px">Template features</div>
              <ul style="margin: 0; padding-left: var(--space-4)">
                <template x-for="f in newLocationTemplateFeatures" :key="f">
                  <li x-text="f"></li>
                </template>
              </ul>
            </div>
            <button class="btn btn-primary btn-xs" @click="createLocation()" style="justify-self: flex-start">Create</button>
          </div>
        </div>
        <div x-show="locations.length === 0" class="empty-state" style="padding: var(--space-4); font-size: 13px">No locations defined</div>
        <template x-if="locations.length > 0">
          <div style="display: grid; gap: var(--space-2)">
            <template x-for="loc in locations" :key="loc.id">
              <div style="padding: var(--space-3); background: var(--bg-secondary, #f8f9fa); border-radius: 4px; border: 1px solid var(--border-default, #e9ecef); cursor: pointer" @click="expandLoc(loc.id)">
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <div>
                    <strong style="font-size: 13px" x-text="loc.name"></strong>
                    <span x-show="loc.templateName && !loc.templateIsDefault" class="tag" style="margin-left: 6px; font-size: 11px" title="Bound to a non-default chat template" x-text="'template: ' + loc.templateName"></span>
                    <span x-show="loc.description && expandedLoc !== loc.id" style="font-size: 12px; color: var(--text-secondary); margin-top: 2px; display: block" x-text="loc.description"></span>
                  </div>
                  <div style="display: flex; gap: 4px" @click.stop>
                    <button class="btn btn-danger btn-xs" @click="deleteLocation(loc.id)">Delete</button>
                  </div>
                </div>
                <div x-show="expandedLoc === loc.id" @click.stop style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border-default, #e9ecef)">
                  <div style="display: grid; gap: var(--space-2)">
                    <input class="form-input" style="font-size: 13px" x-model="editLocName" />
                    <textarea class="form-input form-textarea" rows="2" style="font-size: 13px" x-model="editLocDesc" placeholder="Description"></textarea>
                    <button class="btn btn-primary btn-xs" @click="saveLocation(loc.id)" style="justify-self: flex-start">Save</button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>
      <div style="display: flex; gap: var(--space-3); margin-top: var(--space-4)">
        <a href="/quests?worldId=${worldId}" class="btn btn-primary btn-sm" style="text-decoration: none; display: inline-flex; align-items: center">
          View Quests
        </a>
      </div>
    </div>`,
  );
}

export { serveWorldDetailContent, serveWorldsListDb, };
