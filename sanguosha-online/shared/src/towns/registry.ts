import {
  FROSTPEAK_TOWN_DEFINITION,
} from "./frostpeak.js";
import {
  GREENVALE_TOWN_DEFINITION,
} from "./greenvale.js";
export {
  PLANNED_TOWN_IDS,
  PLANNED_TOWN_PREVIEWS,
} from "./planned.js";
import type {
  EstateTownId,
  TownDefinition,
  TownRouteDefinition,
} from "./types.js";

export const ESTATE_TOWN_IDS = ["greenvale", "frostpeak"] as const;
export * from "./types.js";

export const TOWN_DEFINITIONS: Readonly<
  Record<EstateTownId, TownDefinition>
> = {
  greenvale: GREENVALE_TOWN_DEFINITION,
  frostpeak: FROSTPEAK_TOWN_DEFINITION,
};

export const TOWN_ROUTES: readonly TownRouteDefinition[] = [
  {
    id: "greenvale_frostpeak_rail",
    fromTownId: "greenvale",
    toTownId: "frostpeak",
    mode: "rail",
    name: "河谷—霜岭山地铁路",
    coinFare: 120,
    durationSeconds: 0,
  },
];

export function isEstateTownId(value: unknown): value is EstateTownId {
  return typeof value === "string" &&
    (ESTATE_TOWN_IDS as readonly string[]).includes(value);
}

export function getTownDefinition(townId: EstateTownId): TownDefinition {
  return TOWN_DEFINITIONS[townId];
}

export function getTownRoute(
  fromTownId: EstateTownId,
  toTownId: EstateTownId,
): TownRouteDefinition | null {
  if (fromTownId === toTownId) return null;
  return TOWN_ROUTES.find((route) =>
    (route.fromTownId === fromTownId && route.toTownId === toTownId) ||
    (route.fromTownId === toTownId && route.toTownId === fromTownId)
  ) ?? null;
}
