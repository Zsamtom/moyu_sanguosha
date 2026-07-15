import { FULL_GENERAL_CATALOG, type FullGeneralPack } from "./full-general-catalog.js";
import type { Faction, Gender, GeneralId, GeneralSkillId } from "./types.js";

export interface GeneralDefinition {
  readonly id: GeneralId;
  readonly name: string;
  readonly faction: Faction;
  /** Gods select one of the four ordinary factions when the draft is resolved. */
  readonly factionSelectable: boolean;
  readonly gender: Gender;
  readonly maxHp: number;
  readonly pack: FullGeneralPack;
  readonly skillIds: readonly GeneralSkillId[];
}

const toRuntimeDefinition = (general: (typeof FULL_GENERAL_CATALOG)[number]): GeneralDefinition =>
  Object.freeze({
    id: general.id,
    name: general.name,
    faction: general.faction === "selectable" ? "god" : general.faction,
    factionSelectable: general.faction === "selectable",
    gender: general.gender,
    maxHp: general.maxHp,
    pack: general.pack,
    skillIds: Object.freeze(general.skills.map((skill) => skill.rulesId)),
  });

/** The single authoritative runtime registry for all 66 original-project generals. */
export const ALL_GENERALS: readonly GeneralDefinition[] = Object.freeze(
  FULL_GENERAL_CATALOG.map(toRuntimeDefinition),
);

export const STANDARD_GENERALS: readonly GeneralDefinition[] = Object.freeze(
  ALL_GENERALS.filter((general) => general.pack === "standard"),
);

export const SP_GENERALS: readonly GeneralDefinition[] = Object.freeze(
  ALL_GENERALS.filter((general) => general.pack === "sp"),
);

export const EXTENSION_GENERALS: readonly GeneralDefinition[] = Object.freeze(
  ALL_GENERALS.filter((general) => !["standard", "sp"].includes(general.pack)),
);

export const GENERALS_BY_PACK: Readonly<Record<FullGeneralPack, readonly GeneralDefinition[]>> = Object.freeze({
  standard: STANDARD_GENERALS,
  sp: SP_GENERALS,
  wind: Object.freeze(ALL_GENERALS.filter((general) => general.pack === "wind")),
  fire: Object.freeze(ALL_GENERALS.filter((general) => general.pack === "fire")),
  forest: Object.freeze(ALL_GENERALS.filter((general) => general.pack === "forest")),
  mountain: Object.freeze(ALL_GENERALS.filter((general) => general.pack === "mountain")),
  god: Object.freeze(ALL_GENERALS.filter((general) => general.pack === "god")),
});

/**
 * Backward-compatible default used by legacy snapshots until room rule config is
 * wired into the draft: the 25 standard generals plus the original SP Yuan Shu.
 * Keep its historical order as part of seeded-game compatibility.
 */
const LEGACY_DEFAULT_GENERAL_IDS = [
  "guan_yu", "huang_yue_ying", "liu_bei", "ma_chao", "zhang_fei", "zhao_yun", "zhu_ge_liang",
  "cao_cao", "guo_jia", "si_ma_yi", "xia_hou_dun", "xu_chu", "zhang_liao", "zhen_ji",
  "da_qiao", "gan_ning", "huang_gai", "lu_xun", "lv_meng", "sun_quan", "sun_shang_xiang", "zhou_yu",
  "hua_tuo", "lv_bu", "diao_chan", "yuan_shu",
] as const satisfies readonly GeneralId[];

export const DEFAULT_GENERALS: readonly GeneralDefinition[] = Object.freeze(
  LEGACY_DEFAULT_GENERAL_IDS.map((id) => {
    const general = ALL_GENERALS.find((candidate) => candidate.id === id);
    if (!general) throw new Error(`默认武将目录缺失：${id}`);
    return general;
  }),
);

const GENERAL_BY_ID = new Map<GeneralId, GeneralDefinition>(
  ALL_GENERALS.map((general) => [general.id, general]),
);

export function getGeneralDefinition(id: GeneralId): GeneralDefinition {
  const general = GENERAL_BY_ID.get(id);
  if (!general) throw new Error(`未知武将：${id}`);
  return general;
}

export function hasGeneralSkill(id: GeneralId | null, skillId: GeneralSkillId): boolean {
  return id ? getGeneralDefinition(id).skillIds.includes(skillId) : false;
}
