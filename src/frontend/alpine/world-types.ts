export interface WorldEditState {
  loading: boolean;
  error: boolean;
  activeTab: string;
  world: { id: string; name: string; description: string | null; lore: string | null; tags: string[] } | null;
  tagsStr: string;
  locations: Array<{
    id: string;
    name: string;
    description: string | null;
    parent_location_id: string | null;
  }>;
  locationsLoaded: boolean;
  loadingLocations: boolean;
  showAddForm: boolean;
  newLocName: string;
  newLocDesc: string;
  newLocParentId: string;
  worldId: string | null;
  init(): void;
  saveWorld(): Promise<void>;
  loadLocations(): Promise<void>;
  addLocation(): Promise<void>;
  deleteLocation(locId: string): Promise<void>;
}
