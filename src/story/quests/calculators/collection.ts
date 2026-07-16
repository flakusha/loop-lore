import type { CollectionQuestConfig } from "../../types";
import type { ProgressCalculator } from "../types";

export const calculateCollectionProgress: ProgressCalculator = (_ctx, config, event) => {
  if (!config) return 0;
  if (event.type !== "item_transfer") return 0;
  const cfg = config as CollectionQuestConfig;
  const itemName = typeof event.data.itemName === "string" ? event.data.itemName.toLowerCase() : undefined;
  if (cfg.items) {
    let totalQuantity = 0;
    let hasMatch = false;
    for (const i of cfg.items) {
      totalQuantity += i.quantity;
      if (itemName?.includes(i.itemId.toLowerCase())) hasMatch = true;
    }
    return hasMatch ? Math.round(100 / totalQuantity) : 0;
  }
  return cfg.categoryQuantity ? Math.round(100 / cfg.categoryQuantity) : 10;
};
