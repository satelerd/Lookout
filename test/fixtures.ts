import { parseConfig, type Config } from "../src/model.js";
export const config: Config = parseConfig({
  version: 1,
  groupId: "demo-apartments",
  allowedGroupIds: ["demo-apartments"],
  objective: "Find a synthetic apartment",
  preferences: ["Two bedrooms"],
  budget: { amount: 900, currency: "USD" },
  intervalMinutes: 60,
  sourceHosts: ["example.org"],
  maxItems: 3,
});
