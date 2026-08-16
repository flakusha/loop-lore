// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { editing, } from "./editing";
import { formatting, } from "./formatting";
import { profiles, } from "./profiles";
import type { AdminTemplates, } from "./types";

export const adminTemplates: AdminTemplates = {
  ...profiles,
  ...editing,
  ...formatting,
};
