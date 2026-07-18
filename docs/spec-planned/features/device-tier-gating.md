# Device Tier Gating Implementation

## Overview

Progressive enhancement pattern for 3D and resource-intensive features. Detects device capability and gates features accordingly.

## Implementation

### File: src/frontend/alpine/device-tier.ts

```typescript
export type DeviceTier = "high" | "medium" | "low";

export interface DeviceCapabilities {
  webgl2: boolean;
  webgpu: boolean;
  deviceMemory: number; // GB
  saveData: boolean;
  cores: number;
  touch: boolean;
}

export function detectDeviceTier(): DeviceTier {
  const caps = getCapabilities();

  // High: WebGL2/WebGPU, 4GB+ RAM, not save-data
  if ((caps.webgl2 || caps.webgpu) && caps.deviceMemory >= 4 && !caps.saveData) {
    return "high";
  }

  // Medium: WebGL2, 2GB+ RAM
  if (caps.webgl2 && caps.deviceMemory >= 2) {
    return "medium";
  }

  return "low";
}

export function getCapabilities(): DeviceCapabilities {
  return {
    webgl2: checkWebGL2(),
    webgpu: checkWebGPU(),
    deviceMemory: (navigator as any).deviceMemory || 4,
    saveData: (navigator as any).connection?.saveData || false,
    cores: navigator.hardwareConcurrency || 4,
    touch: "ontouchstart" in window,
  };
}

function checkWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!canvas.getContext("webgl2");
  } catch {
    return false;
  }
}

function checkWebGPU(): boolean {
  return "gpu" in navigator;
}
```

### File: src/frontend/alpine/feature-gate.ts

```typescript
export function featureGate(feature: string): boolean {
  const tier = detectDeviceTier();
  const userOverride = getUserSetting(`enable_${feature}`);

  // User can override in settings
  if (userOverride !== undefined) {
    return userOverride;
  }

  // Feature tier requirements
  const requirements: Record<string, DeviceTier[]> = {
    "3d_world_map": ["high"],
    "3d_avatars": ["high", "medium"],
    "3d_assets": ["high"],
    immersive_audio: ["medium", "high"],
    high_quality_images: ["medium", "high"],
    regex_transforms: ["low", "medium", "high"], // Always available
  };

  return requirements[feature]?.includes(tier) ?? true;
}

// Alpine plugin
export default function () {
  return {
    init() {
      const tier = detectDeviceTier();
      this.$store.device.tier = tier;
      this.$store.device.capabilities = getCapabilities();
    },

    isFeatureEnabled(feature: string) {
      return featureGate(feature);
    },
  };
}
```

### 3D Feature Integration

```typescript
// src/frontend/three/world-map.ts
export class WorldMap3D {
  private renderer: THREE.WebGLRenderer | null = null;

  async init() {
    if (!featureGate("3d_world_map")) {
      console.log("3D disabled for this device, using 2D fallback");
      return this.init2DFallback();
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // ... 3D initialization
  }

  init2DFallback() {
    // Load minimap instead
    return import("./minimap-2d");
  }
}
```

### Settings UI

```html
<!-- src/views/settings.html -->
<fieldset>
  <legend>Performance</legend>

  <div x-data="{ tier: detectDeviceTier() }">
    <p>Device tier: <span x-text="tier"></span></p>

    <template x-if="tier === 'low'">
      <p class="warning">Some features disabled for performance</p>
    </template>

    <label>
      <input type="checkbox" x-model="settings.enable_3d_features" />
      Enable 3D features (may be slow)
    </label>

    <label>
      <input type="checkbox" x-model="settings.reduce_motion" />
      Reduce animations
    </label>
  </div>
</fieldset>
```

## Edge Cases

- Capability detection fails → assume "low"
- User lies in settings → feature may crash, show error
- Memory pressure during 3D → auto-downgrade to 2D
- WebGL context lost → recover gracefully
- Battery low → auto-disable 3D
- Data saver mode → disable high-bandwidth features

## Configuration

```yaml
device_tier:
  auto_detect: true
  user_override: false # Allow users to override detection
  features:
    3d_world_map:
      required_tier: "high"
      fallback: "minimap-2d"
    3d_avatars:
      required_tier: "medium"
      fallback: "static-portrait"
    high_quality_images:
      required_tier: "medium"
      fallback: "compressed-image"
```
