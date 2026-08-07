import { editing, } from "./editing";
import { formatting, } from "./formatting";
import { profiles, } from "./profiles";
import type { AdminTemplates, } from "./types";

export const adminTemplates: AdminTemplates = {
  ...profiles,
  ...editing,
  ...formatting,
};
