# 3D Worlds & Navigation

Browser-based 3D for worlds, characters, and navigation. Added per research review
2026-07-18.

> ⚠️ **Performance caveat (important):** 3D is implementable in browser JS (Three.js /
> WebGL / WebGPU), and 3D asset inference providers exist (text→mesh, NeRF, Gaussian
> splat). But it is **not applicable for weak devices** — low-end phones, old laptops,
> and constrained VMs will choke. All 3D features MUST be **progressive enhancement**:
> capped at a device tier, default off, with a 2D fallback. Gate behind a capability
> check (GPU/WebGL2, `deviceMemory`, `saveData`). Relates to deferred concept D.4
> (3D World) in `.plan/backlog.md`.

## #31 3D world-map navigation

- **What**: Explore the world graph as a navigable 3D map (locations as nodes/terrain,
  connections as paths).
- **Fits**: location graph from `docs/spec/rpg-mechanics.md` (connections, travel cost).
- **Effort**: High
- **Depends on**: location graph data, Three.js, device-tier gating
- **Perf**: off on weak devices; 2D minimap fallback

## #32 3D character / avatar rendering

- **What**: Render characters as posed 3D avatars (extends #1 emotion portraits + #2 VN
  sprites into 3D).
- **Fits**: `assets` portraits, RPG `status_effects`.
- **Effort**: High
- **Depends on**: #1/#2, glTF rigs, device-tier gating

## #33 3D asset inference providers

- **What**: Generate 3D assets (meshes, scenes, props) from text/prompts via inference
  providers; ingest into the asset system.
- **Fits**: `docs/spec/assets.md` polymorphic linking + `docs/spec/integrations/
image-generation.md` pattern (extend to 3D).
- **Effort**: High
- **Depends on**: 3D-gen provider, asset pipeline

## #34 Immersive scene view

- **What**: First/third-person walkthrough of a location using its assets + ambient
  audio (#3).
- **Fits**: location assets, ambient audio.
- **Effort**: High
- **Depends on**: #31, #3, device-tier gating

## Device-tier gating pattern (recommended)

- Capability probe: `navigator.gpu` / WebGL2, `navigator.deviceMemory`,
  `navigator.connection.saveData`.
- Settings toggle: "Enable 3D (may be slow on this device)".
- Always ship a 2D equivalent (minimap, sprites, static scenes).
