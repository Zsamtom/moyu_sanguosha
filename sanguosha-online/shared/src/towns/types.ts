export type EstateTownId = "greenvale" | "frostpeak";
export type PlannedTownId = "tidal_harbor" | "redrock";
export type KnownTownId = EstateTownId | PlannedTownId;

export interface TownWeatherAnchor {
  readonly cityName: string;
  readonly countryCode: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timeZone: string;
  readonly refreshIntervalSeconds: number;
}

export interface TownUnlockRequirements {
  readonly sourceTownId: EstateTownId | null;
  readonly minimumFarmLevel: number;
  readonly minimumRanchLevel: number;
  readonly minimumMineLevel: number;
  readonly minimumReputation: number;
  readonly requiredResearchIds: readonly string[];
  readonly coinCost: number;
}

export interface TownTravelDefinition {
  readonly terminalName: string;
  readonly defaultMode: "local" | "rail" | "ship" | "caravan";
}

export interface TownContentDefinition {
  readonly cropIds: readonly string[];
  readonly animalIds: readonly string[];
  readonly productIds: readonly string[];
  readonly depositIds: readonly string[];
}

export interface TownDefinition {
  readonly id: EstateTownId;
  readonly contentVersion: number;
  readonly rulesetId: "standard_three_sector_v1";
  readonly name: string;
  readonly subtitle: string;
  readonly climate: string;
  readonly description: string;
  readonly landmarkName: string;
  readonly specialties: readonly string[];
  readonly unlockRequirements: TownUnlockRequirements;
  readonly travel: TownTravelDefinition;
  readonly weatherAnchor: TownWeatherAnchor;
  readonly content: TownContentDefinition;
}

export interface PlannedTownPreview {
  readonly id: PlannedTownId;
  readonly name: string;
  readonly subtitle: string;
  readonly climate: string;
  readonly description: string;
  readonly plannedSpecialties: readonly string[];
  /** Reserved planning metadata. Planned towns do not issue weather calls. */
  readonly weatherAnchor: TownWeatherAnchor;
}

export interface TownRouteDefinition {
  readonly id: string;
  readonly fromTownId: EstateTownId;
  readonly toTownId: EstateTownId;
  readonly mode: Exclude<TownTravelDefinition["defaultMode"], "local">;
  readonly name: string;
  readonly coinFare: number;
  readonly durationSeconds: number;
}

export interface TownCropDefinition {
  readonly id: string;
  readonly name: string;
  readonly unlockLevel: number;
  readonly seedCost: number;
  readonly basePrice: number;
  readonly minimumPrice: number;
  readonly maximumPrice: number;
  readonly growthSeconds: number;
  readonly yield: number;
  readonly harvestExperience: number;
}

export interface TownAnimalDefinition {
  readonly id: string;
  readonly name: string;
  readonly productId: string;
  readonly productName: string;
  readonly requiredFarmLevel: number;
  readonly requiredRanchLevel: number;
  readonly purchaseCost: number;
  readonly resalePrice: number;
  readonly feedCropId: string;
  readonly feedAmount: number;
  readonly careCost: number;
  readonly productionSeconds: number;
  readonly yield: number;
  readonly productPrice: number;
  readonly collectExperience: number;
}

export interface TownDepositDefinition {
  readonly id: string;
  readonly name: string;
  readonly requiredFarmLevel: number;
  readonly requiredRanchLevel: number;
  readonly requiredMineLevel: number;
  readonly expeditionCost: number;
  readonly rationProductId: string;
  readonly rationAmount: number;
  readonly supportProductId: string;
  readonly supportAmount: number;
  readonly durationSeconds: number;
  readonly yield: number;
  readonly orePrice: number;
  readonly collectExperience: number;
}
