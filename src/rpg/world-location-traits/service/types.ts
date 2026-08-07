/** World trait category enum */
export type WorldTraitCategory =
  | "environmental"
  | "cultural"
  | "magical"
  | "technological"
  | "political"
  | "economic";

export interface WorldTraitRow {
  id: string;
  actor_id: string;
  world_id: string;
  trait_category: WorldTraitCategory;
  trait_name: string;
  trait_value: string;
  created_at: string;
  updated_at: string;
}

export interface LocationTraitRow {
  id: string;
  actor_id: string;
  location_id: string;
  trait_name: string;
  trait_value: string;
  bonus: number;
  penalty: number;
  effects: string;
  equipment_override: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorldTraitInput {
  actor_id: string;
  world_id: string;
  trait_category: WorldTraitCategory;
  trait_name: string;
  trait_value: string;
}

export interface UpdateWorldTraitInput {
  trait_category?: WorldTraitCategory;
  trait_name?: string;
  trait_value?: string;
}

export interface CreateLocationTraitInput {
  actor_id: string;
  location_id: string;
  trait_name: string;
  trait_value: string;
  bonus?: number;
  penalty?: number;
  effects?: Record<string, unknown>;
  equipment_override?: Record<string, unknown>;
}

export interface UpdateLocationTraitInput {
  trait_name?: string;
  trait_value?: string;
  bonus?: number;
  penalty?: number;
  effects?: Record<string, unknown>;
  equipment_override?: Record<string, unknown>;
}
