// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../config/schema";
import { validateProviderUrl, } from "../../utils/url-validation";
import { generateComfyUI, } from "./comfyui";
import { failure, } from "./helpers";
import { generateOpenAI, } from "./openai";
import { generateSDAPI, } from "./sdapi";
import { generateSDCPP, } from "./sdcpp";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";

// ── Public API re-exports ──────────────────────────────────
export type {
  ImageGenFailure,
  ImageGenOptions,
  ImageGenOutcome,
  ImageGenSuccess,
} from "./types";

/**
 * Generate images using the configured provider.
 *
 * @param sdConfig - Resolved image provider config
 * @param opts - Generation request inputs
 * @returns A discriminated outcome; never throws on provider failures
 */
export async function generateImages(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const validated = validateProviderUrl(sdConfig.baseUrl,);
  if (!validated.ok) {
    return failure(`Invalid image provider URL: ${validated.error}`, 400,);
  }

  switch (sdConfig.apiFamily) {
    case "openai": {
      return generateOpenAI(sdConfig, opts,);
    }
    case "sdapi": {
      return generateSDAPI(sdConfig, opts,);
    }
    case "sdcpp": {
      return generateSDCPP(sdConfig, opts,);
    }
    case "comfyui": {
      return generateComfyUI(sdConfig, opts,);
    }
    default: {
      return failure(
        `Image gen API family "${
          String(sdConfig.apiFamily,)
        }" not supported. Use "openai", "sdapi", "sdcpp", or "comfyui".`,
        501,
      );
    }
  }
}
