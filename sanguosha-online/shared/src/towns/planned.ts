import type { PlannedTownPreview } from "./types.js";

export const PLANNED_TOWN_IDS = ["tidal_harbor", "redrock"] as const;

export const PLANNED_TOWN_PREVIEWS: Readonly<
  Record<(typeof PLANNED_TOWN_IDS)[number], PlannedTownPreview>
> = {
  tidal_harbor: {
    id: "tidal_harbor",
    name: "潮汐港",
    subtitle: "海湾潮汐庄园",
    climate: "暖湿海湾",
    description: "围绕潮汐窗口、保鲜和港口物流展开的后续城镇。",
    plannedSpecialties: ["水产养殖", "盐矿", "冷链与保鲜"],
  },
  redrock: {
    id: "redrock",
    name: "赤岩城",
    subtitle: "旱地能源庄园",
    climate: "干旱高原",
    description: "围绕有限水源与能源调度展开的后续城镇。",
    plannedSpecialties: ["缺水农业", "驮畜", "铜盐矿与能源调度"],
  },
};
