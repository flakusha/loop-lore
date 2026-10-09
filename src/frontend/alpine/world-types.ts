// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 290

/** */
export interface WorldEditState {
  loading: boolean;
  error: boolean;
  activeTab: string;
  world: { id: string; name: string; description: string | null; lore: string | null; tags: string[] } | null;
  tagsStr: string;
  locations: {
    id: string;
    name: string;
    description: string | null;
    parent_location_id: string | null;
  }[];
  locationsLoaded: boolean;
  loadingLocations: boolean;
  showAddForm: boolean;
  newLocName: string;
  newLocDesc: string;
  newLocParentId: string;
  newLocConnections: string[];
  editingLocationId: string;
  expandedLoc: string;
  editLocName: string;
  editLocDesc: string;
  locationSearch: string;
  items: {
    id: string;
    name: string;
    description: string | null;
    category: string;
    rarity: string;
    value: number;
    weight: number;
    stackable: boolean;
    max_stack: number;
    properties: Record<string, unknown> | null;
  }[];
  itemsLoaded: boolean;
  loadingItems: boolean;
  newItemName: string;
  newItemDesc: string;
  newItemCategory: string;
  newItemRarity: string;
  newItemValue: string;
  newItemWeight: string;
  expandedItem: string;
  editItemName: string;
  editItemDesc: string;
  editItemCategory: string;
  editItemRarity: string;
  editItemValue: string;
  editItemWeight: string;
  locName(locId: string | null,): string;
  instances: {
    id: string;
    item_id: string;
    location_id: string | null;
    owner_actor_id: string | null;
    quantity: number;
    visibility: string;
    created_at: string;
  }[];
  instancesLoaded: boolean;
  loadingInstances: boolean;
  placeLocationId: string;
  placeQuantity: string;
  worldId: string | null;
  invites: {
    id: string;
    worldId: string;
    code: string;
    createdAt: string;
    expiresAt: string | null;
    maxUses: number | null;
    uses: number;
    status: string;
  }[];
  loadingInvites: boolean;
  invitesLoaded: boolean;
  newInviteMaxUses: string;
  showInviteForm: boolean;
  init(): void;
  saveWorld(): Promise<void>;
  loadLocations(): Promise<void>;
  addLocation(): Promise<void>;
  deleteLocation(locId: string,): Promise<void>;
  expandLoc(locId: string,): void;
  saveLocation(locId: string,): Promise<void>;
  filterLocations(): void;
  loadItems(): Promise<void>;
  addItem(): Promise<void>;
  expandItem(itemId: string,): void;
  saveItem(itemId: string,): Promise<void>;
  deleteItem(itemId: string,): Promise<void>;
  loadInstances(itemId: string,): Promise<void>;
  placeInstance(itemId: string,): Promise<void>;
  destroyInstance(instanceId: string,): Promise<void>;
  loadInvites(): Promise<void>;
  createInvite(): Promise<void>;
  copyInviteCode(code: string,): void;
  revokeInvite(inviteId: string,): Promise<void>;
}

/** The world summary the world page header/panels need. */
export interface WorldSummary {
  id: string;
  name: string;
  description: string | null;
  kind: string;
}

/** The SSE `conditions` event payload (routes/worlds/world-stream.ts). */
export interface WorldConditionsSnapshot {
  timeOfDay: string | null;
  weather: string | null;
  sampledLocationId: string | null;
  sampledLocationName: string | null;
  sampledAt: string | null;
}

/** A location row as the world page list needs it. */
export interface WorldLocationLite {
  id: string;
  name: string;
  description: string | null;
  parent_location_id: string | null;
  connections: string;
  coord_x: number | null;
  coord_y: number | null;
}

/** GET /worlds/:worldId/locations/:locId/details payload (location-explorer route). */
export interface WorldLocationDetail {
  id: string;
  name: string;
  description: string | null;
  parent_location_id: string | null;
  parent: { id: string; name: string } | null;
  connections: Array<{ id: string; name: string }>;
  state: {
    description_override: string | null;
    atmosphere: string | null;
    npcs_present: string;
    items_available: string;
    time_of_day: string | null;
    weather: string | null;
    hazards: string;
  } | null;
}

/** A chat the current user participates in (GET /worlds/:worldId/chats). */
export interface WorldChatLite {
  id: string;
  name: string;
  current_location_id: string | null;
  location_name: string | null;
}

/** GET /worlds/:worldId/npcs-at/:locationId row. */
export interface NpcPresent {
  actorId: string;
  displayName: string;
}

/** A transport following a route (GET /worlds/:worldId/travel/status). */
export interface TransportStatus {
  locationId: string;
  name: string;
  routeId: string;
  routeName: string;
  loop: boolean;
  progress: number;
  stopCount: number;
  nextStopName: string | null;
  hazards: string[];
}

/** A party walking a stored route (GET /worlds/:worldId/travel/status). */
export interface PartyStatus {
  id: string;
  name: string;
  status: string;
  routeIndex: number;
  travelProgress: number;
  currentLocationId: string | null;
  currentLocationName: string | null;
  hazards: string[];
}

/** The whole travel-status payload. */
export interface TravelStatusPayload {
  transports: TransportStatus[];
  parties: PartyStatus[];
}

/** GET /worlds/:worldId/lore-entries row (camelCase projection). */
export interface WorldLoreEntry {
  id: string;
  name: string | null;
  content: string;
  /** Raw JSON string of trigger keys; parse with `parseLoreKeys`. */
  keys: string | null;
  enabled: string;
  constant: number | null;
  priority: number | null;
  comment: string | null;
}

/** The merged world-page Alpine state. Mixins fill disjoint slices. */
export interface WorldPageState {
  // ── core (world.ts) ──
  worldId: string;
  world: WorldSummary | null;
  worldLoading: boolean;
  worldError: boolean;
  locations: WorldLocationLite[];
  locationsLoading: boolean;
  sseConnected: boolean;
  _conditionsSse: EventSource | null;
  init(): () => void;
  loadWorld(): Promise<void>;
  loadLocations(): Promise<void>;
  connectConditionsStream(): void;
  applyConditions(snapshot: WorldConditionsSnapshot,): void;
  locationById(id: string,): WorldLocationLite | undefined;
  connectionIdsOf(location: WorldLocationLite,): string[];

  // ── time/weather widget (time-weather.ts) ──
  timeOfDay: string | null;
  weather: string | null;
  conditionsLocationName: string | null;
  conditionsAt: string | null;
  readonly hasConditions: boolean;
  readonly timeIcon: string;
  readonly weatherIcon: string;
  readonly dayNightLabel: string;
  readonly forecastAvailable: boolean;

  // ── location details (location-details.ts) ──
  selectedLocationId: string;
  detail: WorldLocationDetail | null;
  detailLoading: boolean;
  detailError: boolean;
  detailNpcs: NpcPresent[];
  showItems: boolean;
  readonly detailHazards: string[];
  readonly detailItems: string[];

  // ── lore editor (world-lore.ts) ──
  loreEntries: WorldLoreEntry[];
  loreLoading: boolean;
  loreError: boolean;
  loreFormOpen: boolean;
  loreEditingId: string | null;
  loreBusy: boolean;
  loreMessage: string;
  loreForm: { name: string; keys: string; content: string; priority: string; constant: boolean };
  loadLore(): Promise<void>;
  openLoreForm(id: string | null,): void;
  cancelLoreForm(): void;
  saveLore(): Promise<void>;
  deleteLore(id: string,): Promise<void>;
  parseLoreKeys(raw: string | null | undefined,): string[];
  readonly loreGroups: { constant: WorldLoreEntry[]; enabled: WorldLoreEntry[]; disabled: WorldLoreEntry[] };
  selectLocation(id: string,): Promise<void>;
  loadLocationDetail(id: string,): Promise<void>;

  // ── quick actions (location-actions.ts) ──
  worldChats: WorldChatLite[];
  chatsLoading: boolean;
  loadWorldChats(): Promise<void>;
  chatsAt(locationId: string | null,): WorldChatLite[];
  moveChatTo(chatId: string, locationId: string,): Promise<void>;
  navigateExplore(): void;

  // ── travel interface (travel-interface.ts) ──
  originId: string;
  destinationId: string;
  travelMethodId: string;
  travelStatus: TravelStatusPayload | null;
  travelLoading: boolean;
  showTravelConfirm: boolean;
  travelChatId: string;
  travelBusy: boolean;
  travelMessage: string;
  loadTravelStatus(): Promise<void>;
  readonly destinations: WorldLocationLite[];
  readonly travelEtaLabel: string;
  readonly travelConnected: boolean;
  readonly transportProgresses: Array<{
    name: string;
    pct: number;
    routeName: string;
    nextStopName: string | null;
    hazards: string[];
  }>;
  readonly partyStatuses: PartyStatus[];
  openTravelConfirm(): void;
  confirmTravel(): Promise<void>;
}
