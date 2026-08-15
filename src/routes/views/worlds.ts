import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import { escapeHtml, htmlResponse, } from "./layout";

function parseFeaturesJson(raw: string | null,): string[] {
  if (!raw) { return []; }
  const parsed = safeJsonParse(raw,);
  return parsed.ok && Array.isArray(parsed.value,)
    ? Array.from(parsed.value, String,)
    : [];
}

async function serveWorldsListDb(
  database: Kysely<DB>,
  userId: string | null,
  userRole: string | null,
): Promise<Response> {
  let qb = database.selectFrom("worlds",).selectAll().orderBy("name", "asc",).limit(100,);
  // Non-admin users only see their own worlds (mirrors GET /api/worlds).
  if (userId && userRole !== "admin") {
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

  const items = Array.from(worlds, (w,) => {
    const name = escapeHtml(w.name,);
    const desc = escapeHtml(w.description || "",);
    return `<div class="world-card" onclick="location.assign('/worlds/${w.id}')" data-testid="world-card-${w.id}">
      <div class="world-header"><h3 class="world-name">${name}</h3><span class="world-id">ID: ${w.id}</span></div>
      <div class="world-description">${desc}</div>
      <div class="world-meta"><span class="tag">0 chats</span></div>
    </div>`;
  },).join("",);

  return htmlResponse(items,);
}

async function serveWorldDetailContent(
  worldId: string,
  database: Kysely<DB>,
  userId: string | null,
  userRole: string | null,
): Promise<Response> {
  const world = await database.selectFrom("worlds",).selectAll().where("id", "=", worldId,).executeTakeFirst();

  // Mirror the API: only the owner (or admin) may view world details.
  if (!world || (userRole !== "admin" && world.owner_id !== userId)) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">⚠️</div>
      <div class="title">World not found</div>
    </div>`,);
  }

  const name = escapeHtml(world.name,);
  const desc = escapeHtml(world.description || "",);
  const lore = escapeHtml(world.lore || "",);

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
    `<div style="max-width:800px;margin:0 auto" x-data="worldDetail({ worldId: '${worldId}', locations: ${locationsJson}, templates: ${templatesJson} })">
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <h2>${name}</h2>
        <p class="description">${desc}</p>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <label class="form-label">Lore</label>
        <div class="lore-content">${lore}</div>
      </div>
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
