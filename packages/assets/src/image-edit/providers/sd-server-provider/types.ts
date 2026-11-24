// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ImageProviderConfig, } from "../../../../../../src/config/schema";
import type { ImageApiFamily, } from "../../../../../../src/db/enums-config";

/** Handle for the provider's runtime config, threaded into dispatcher modules. */
export interface SDServerHost {
  baseUrl: string | null;
  apiFamily: ImageApiFamily;
  getConfig(): ImageProviderConfig | null;
}
