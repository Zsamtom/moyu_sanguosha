import type {
  Card,
  CardCategory,
  CardKind,
  CardName,
  CardRank,
  CardSuit,
  DamageNature,
  EquipmentSlot,
  SlashCardKind,
} from "./types.js";

export interface CardDefinition {
  readonly name: CardName;
  readonly category: CardCategory;
  readonly equipmentSlot?: EquipmentSlot;
  readonly weaponRange?: number;
}

export const CARD_DEFINITIONS = {
  slash: { name: "杀", category: "basic" },
  fire_slash: { name: "火杀", category: "basic" },
  thunder_slash: { name: "雷杀", category: "basic" },
  dodge: { name: "闪", category: "basic" },
  peach: { name: "桃", category: "basic" },
  wine: { name: "酒", category: "basic" },
  ex_nihilo: { name: "无中生有", category: "trick" },
  duel: { name: "决斗", category: "trick" },
  barbarian_invasion: { name: "南蛮入侵", category: "trick" },
  arrow_barrage: { name: "万箭齐发", category: "trick" },
  peach_garden: { name: "桃园结义", category: "trick" },
  chi_tu: { name: "赤兔", category: "equipment", equipmentSlot: "offensive_horse" },
  da_wan: { name: "大宛", category: "equipment", equipmentSlot: "offensive_horse" },
  zi_xing: { name: "紫骍", category: "equipment", equipmentSlot: "offensive_horse" },
  di_lu: { name: "的卢", category: "equipment", equipmentSlot: "defensive_horse" },
  hua_liu: { name: "骅骝", category: "equipment", equipmentSlot: "defensive_horse" },
  jue_ying: { name: "绝影", category: "equipment", equipmentSlot: "defensive_horse" },
  zhua_huang_fei_dian: { name: "爪黄飞电", category: "equipment", equipmentSlot: "defensive_horse" },
  zhu_ge_lian_nu: { name: "诸葛连弩", category: "equipment", equipmentSlot: "weapon", weaponRange: 1 },
  gu_ding_dao: { name: "古锭刀", category: "equipment", equipmentSlot: "weapon", weaponRange: 2 },
  ci_xiong_shuang_gu_jian: { name: "雌雄双股剑", category: "equipment", equipmentSlot: "weapon", weaponRange: 2 },
  han_bing_jian: { name: "寒冰剑", category: "equipment", equipmentSlot: "weapon", weaponRange: 2 },
  qing_long_yan_yue_dao: { name: "青龙偃月刀", category: "equipment", equipmentSlot: "weapon", weaponRange: 3 },
  zhang_ba_she_mao: { name: "丈八蛇矛", category: "equipment", equipmentSlot: "weapon", weaponRange: 3 },
  guan_shi_fu: { name: "贯石斧", category: "equipment", equipmentSlot: "weapon", weaponRange: 3 },
  fang_tian_hua_ji: { name: "方天画戟", category: "equipment", equipmentSlot: "weapon", weaponRange: 4 },
  zhu_que_yu_shan: { name: "朱雀羽扇", category: "equipment", equipmentSlot: "weapon", weaponRange: 4 },
  qi_lin_gong: { name: "麒麟弓", category: "equipment", equipmentSlot: "weapon", weaponRange: 5 },
  ren_wang_dun: { name: "仁王盾", category: "equipment", equipmentSlot: "armor" },
  teng_jia: { name: "藤甲", category: "equipment", equipmentSlot: "armor" },
  bai_yin_shi_zi: { name: "白银狮子", category: "equipment", equipmentSlot: "armor" },
  ba_gua_zhen: { name: "八卦阵", category: "equipment", equipmentSlot: "armor" },
  qing_gang_jian: { name: "青釭剑", category: "equipment", equipmentSlot: "weapon", weaponRange: 2 },
  le_bu_si_shu: { name: "乐不思蜀", category: "trick" },
  bing_liang_cun_duan: { name: "兵粮寸断", category: "trick" },
  shan_dian: { name: "闪电", category: "trick" },
  wu_xie_ke_ji: { name: "无懈可击", category: "trick" },
  guo_he_chai_qiao: { name: "过河拆桥", category: "trick" },
  shun_shou_qian_yang: { name: "顺手牵羊", category: "trick" },
  fire_attack: { name: "火攻", category: "trick" },
  amazing_grace: { name: "五谷丰登", category: "trick" },
  borrowed_sword: { name: "借刀杀人", category: "trick" },
  iron_chain: { name: "铁索连环", category: "trick" },
} as const satisfies Readonly<Record<CardKind, CardDefinition>>;

export const STANDARD_DECK_SIZE = 160;

export function getCardDefinition(kind: CardKind): CardDefinition {
  return CARD_DEFINITIONS[kind];
}

export function isSlashCardKind(kind: CardKind): kind is SlashCardKind {
  return kind === "slash" || kind === "fire_slash" || kind === "thunder_slash";
}

export function damageNatureForSlash(kind: SlashCardKind): DamageNature {
  if (kind === "fire_slash") return "fire";
  if (kind === "thunder_slash") return "thunder";
  return "normal";
}

/**
 * Builds the supported standard-card deck. Its cards preserve the
 * suits, ranks, duplicates, and relative counts from the original Java
 * CardsHeap for exactly the card kinds implemented by this engine.
 */
export function createStandardDeck(): Card[] {
  const cards: Card[] = [];
  const counts = new Map<CardKind, number>();
  const add = (kind: CardKind, suit: CardSuit, ...ranks: CardRank[]): void => {
    const definition = getCardDefinition(kind);
    for (const rank of ranks) {
      const serial = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, serial);
      cards.push({
        id: `${kind}-${String(serial).padStart(2, "0")}`,
        kind,
        name: definition.name,
        category: definition.category,
        suit,
        rank,
      });
    }
  };

  // Basic cards.
  add("slash", "heart", 10, 10, 11);
  add("slash", "diamond", 6, 7, 8, 9, 10, 13);
  add("slash", "spade", 7, 8, 8, 9, 9, 10, 10);
  add("slash", "club", 2, 3, 4, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11);

  add("dodge", "diamond", 2, 2, 3, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11);
  add("dodge", "heart", 2, 2, 8, 9, 10, 11, 12, 13);

  add("peach", "heart", 3, 4, 5, 6, 7, 8, 9, 12);
  add("peach", "diamond", 2, 2, 3, 12);

  add("wine", "club", 3, 9);
  add("wine", "spade", 3, 9);
  add("wine", "diamond", 9);

  add("thunder_slash", "spade", 4, 5, 6, 7, 8);
  add("thunder_slash", "club", 5, 6, 7, 8);
  add("fire_slash", "diamond", 4, 5);
  add("fire_slash", "heart", 4, 7, 10);

  // Immediate trick cards in this first migration batch.
  add("ex_nihilo", "heart", 7, 8, 9, 12);
  add("barbarian_invasion", "spade", 7, 13);
  add("barbarian_invasion", "club", 7);
  add("arrow_barrage", "heart", 1);
  add("duel", "spade", 1);
  add("duel", "diamond", 1);
  add("duel", "club", 1);
  add("peach_garden", "heart", 1);
  add("zhua_huang_fei_dian", "heart", 13);
  add("jue_ying", "spade", 5);
  add("di_lu", "club", 5);
  add("chi_tu", "heart", 5);
  add("zi_xing", "diamond", 13);
  add("da_wan", "spade", 13);
  add("hua_liu", "diamond", 13);
  add("zhu_ge_lian_nu", "diamond", 1);
  add("zhu_ge_lian_nu", "club", 1);
  add("gu_ding_dao", "spade", 1);
  add("ren_wang_dun", "club", 2);
  add("teng_jia", "club", 2);
  add("teng_jia", "spade", 2);
  add("bai_yin_shi_zi", "club", 1);
  add("ba_gua_zhen", "spade", 2);
  add("ba_gua_zhen", "club", 2);
  add("qing_gang_jian", "spade", 6);
  add("ci_xiong_shuang_gu_jian", "spade", 2);
  add("han_bing_jian", "spade", 2);
  add("qing_long_yan_yue_dao", "spade", 5);
  add("zhang_ba_she_mao", "spade", 12);
  add("guan_shi_fu", "diamond", 5);
  add("fang_tian_hua_ji", "diamond", 12);
  add("zhu_que_yu_shan", "diamond", 1);
  add("qi_lin_gong", "heart", 5);
  add("le_bu_si_shu", "heart", 6);
  add("le_bu_si_shu", "spade", 6);
  add("le_bu_si_shu", "club", 6);
  add("bing_liang_cun_duan", "club", 4);
  add("bing_liang_cun_duan", "spade", 10);
  add("shan_dian", "spade", 1);
  add("shan_dian", "heart", 12);
  add("wu_xie_ke_ji", "spade", 11);
  add("wu_xie_ke_ji", "spade", 13);
  add("wu_xie_ke_ji", "club", 12);
  add("wu_xie_ke_ji", "club", 13);
  add("wu_xie_ke_ji", "diamond", 12);
  add("wu_xie_ke_ji", "heart", 1);
  add("wu_xie_ke_ji", "heart", 13);
  add("guo_he_chai_qiao", "spade", 3);
  add("guo_he_chai_qiao", "spade", 4);
  add("guo_he_chai_qiao", "spade", 12);
  add("guo_he_chai_qiao", "club", 3);
  add("guo_he_chai_qiao", "club", 4);
  add("guo_he_chai_qiao", "heart", 12);
  add("shun_shou_qian_yang", "diamond", 3);
  add("shun_shou_qian_yang", "diamond", 4);
  add("shun_shou_qian_yang", "spade", 3);
  add("shun_shou_qian_yang", "spade", 4);
  add("shun_shou_qian_yang", "spade", 12);
  add("fire_attack", "heart", 2, 3, 12);
  add("amazing_grace", "heart", 3, 4);
  add("borrowed_sword", "club", 12, 13);
  add("iron_chain", "spade", 11, 12);
  add("iron_chain", "club", 10, 11, 12, 13);

  if (cards.length !== STANDARD_DECK_SIZE) {
    throw new Error(`标准牌堆数量错误：预期 ${STANDARD_DECK_SIZE}，实际 ${cards.length}。`);
  }
  return cards;
}
