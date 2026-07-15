import type { FullGeneralId } from "./full-general-ids.js";
import type { FullSkillRulesId } from "./full-skill-ids.js";
import type { CompleteRulesEngineState } from "./engine/state.js";
import type { JudgmentFrame } from "./engine/judgment.js";

export type PlayerId = string;
export type CardId = string;

export type Role = "lord" | "loyalist" | "rebel" | "renegade";
export type Faction = "wei" | "shu" | "wu" | "qun" | "god";
export type Gender = "male" | "female";
export type GeneralId = FullGeneralId;
export type GeneralSkillId = FullSkillRulesId;

export type CardSuit = "spade" | "heart" | "club" | "diamond";
export type CardRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type CardCategory = "basic" | "trick" | "equipment";
export type EquipmentSlot = "weapon" | "armor" | "offensive_horse" | "defensive_horse";
export type SlashCardKind = "slash" | "fire_slash" | "thunder_slash";
export type WeaponCardKind =
  | "zhu_ge_lian_nu" | "gu_ding_dao" | "qing_gang_jian"
  | "ci_xiong_shuang_gu_jian" | "han_bing_jian" | "qing_long_yan_yue_dao" | "zhang_ba_she_mao"
  | "guan_shi_fu" | "fang_tian_hua_ji" | "zhu_que_yu_shan" | "qi_lin_gong";
export type CardKind =
  | SlashCardKind
  | "dodge"
  | "peach"
  | "wine"
  | "ex_nihilo"
  | "duel"
  | "barbarian_invasion"
  | "arrow_barrage"
  | "peach_garden"
  | "chi_tu" | "da_wan" | "zi_xing"
  | "di_lu" | "hua_liu" | "jue_ying" | "zhua_huang_fei_dian"
  | "zhu_ge_lian_nu" | "gu_ding_dao"
  | "ci_xiong_shuang_gu_jian" | "han_bing_jian" | "qing_long_yan_yue_dao" | "zhang_ba_she_mao"
  | "guan_shi_fu" | "fang_tian_hua_ji" | "zhu_que_yu_shan" | "qi_lin_gong"
  | "ren_wang_dun" | "teng_jia" | "bai_yin_shi_zi" | "ba_gua_zhen" | "qing_gang_jian"
  | "le_bu_si_shu" | "bing_liang_cun_duan" | "shan_dian"
  | "wu_xie_ke_ji" | "guo_he_chai_qiao" | "shun_shou_qian_yang"
  | "fire_attack" | "amazing_grace" | "borrowed_sword" | "iron_chain";
export type CardName =
  | "杀"
  | "火杀"
  | "雷杀"
  | "闪"
  | "桃"
  | "酒"
  | "无中生有"
  | "决斗"
  | "南蛮入侵"
  | "万箭齐发"
  | "桃园结义"
  | "赤兔" | "大宛" | "紫骍" | "的卢" | "骅骝" | "绝影" | "爪黄飞电"
  | "诸葛连弩" | "古锭刀" | "雌雄双股剑" | "寒冰剑" | "青龙偃月刀" | "丈八蛇矛"
  | "贯石斧" | "方天画戟" | "朱雀羽扇" | "麒麟弓"
  | "仁王盾" | "藤甲" | "白银狮子" | "八卦阵" | "青釭剑"
  | "乐不思蜀" | "兵粮寸断" | "闪电"
  | "无懈可击" | "过河拆桥" | "顺手牵羊"
  | "火攻" | "五谷丰登" | "借刀杀人" | "铁索连环";

export type DamageNature = "normal" | "fire" | "thunder";
export type GameStatus = "playing" | "finished";
export type TurnPhase = "prepare" | "judgment" | "draw" | "play" | "respond" | "discard" | "end";

export interface Card {
  readonly id: CardId;
  readonly kind: CardKind;
  readonly name: CardName;
  readonly category: CardCategory;
  readonly suit: CardSuit;
  readonly rank: CardRank;
}

export interface GamePlayer {
  readonly id: PlayerId;
  readonly seat: number;
  role: Role;
  /** Null only while restoring a room created before general metadata existed. */
  generalId: GeneralId | null;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Authoritative live orientation. New games start face up. */
  readonly faceUp: boolean;
  hand: Card[];
  equipment: Partial<Record<EquipmentSlot, Card>>;
  /** Public delayed tricks waiting for this player's judgment phase. */
  judgment: Card[];
  /** Whether elemental damage can currently propagate through this player. */
  chained: boolean;
  /** Skill-owned private/public piles (田、权、忍、化身等) keyed by stable pile id. */
  extraPiles: Record<string, Card[]>;
}

export interface TurnState {
  number: number;
  playerId: PlayerId;
  phase: TurnPhase;
  slashUsed: boolean;
  /** 酒在每个出牌阶段限用一次。 */
  wineUsed: boolean;
  /** 本回合下一张杀的伤害加值；使用杀时消耗，回合结束时清零。 */
  slashDamageBonus: number;
  requiredDiscardCount: number;
  /** Current discard substage. Yongsi resolves before the ordinary hand-limit discard. */
  discardStage: "hand_limit" | "yongsi";
  skipDraw: boolean;
  skipPlay: boolean;
  /** Xu Chu chose Luoyi for this turn's draw phase. */
  luoyiActive: boolean;
  /** The current player played a Slash as a response during their own turn. */
  slashRespondedInPlayPhase: boolean;
  /** Per-turn successful active-skill usage counters. */
  skillUseCounts: Partial<Record<GeneralSkillId, number>>;
  /** Cards Liu Bei has transferred through Rende during this play phase. */
  rendeGivenCount: number;
  /** Rende's one-time healing threshold has already been consumed this turn. */
  rendeRecovered: boolean;
}

export type LordDispatchSkillId = "hujia" | "jijiang";

/** One lord-dispatch attempt may not be restarted after every provider passed. */
export interface LordDispatchAttemptState {
  readonly declinedLordSkillIds?: LordDispatchSkillId[];
}

/** JSON-safe continuation consumed exactly once after the whole Slash sequence settles. */
export type SlashResolutionContinuation =
  | { readonly type: "default" }
  | {
      readonly type: "turn_flow";
      readonly continuationId: number;
      readonly playerId: PlayerId;
      readonly destination: "play" | "discard_or_end";
    };

export interface PendingSlashResponse extends LordDispatchAttemptState {
  readonly type: "slash";
  readonly attackerId: PlayerId;
  readonly targetId: PlayerId;
  readonly cardId: CardId;
  /** Every physical entity card that constitutes this Slash (two for Zhang Ba). */
  readonly damageCardIds?: CardId[];
  readonly slashKind: SlashCardKind;
  readonly damage: number;
  readonly nature: DamageNature;
  readonly color: "red" | "black" | "colorless";
  readonly armorAttempted?: boolean;
  readonly armorIgnored?: boolean;
  /** Total Dodge responses needed for this target (2 when the attacker has Wushuang). */
  readonly requiredDodgeCount?: number;
  /** Dodge responses already accepted for this target. Persisted between response prompts. */
  readonly dodgesPlayed?: number;
  /** Remaining targets of the same physical Slash (Fang Tian Halberd). */
  readonly remainingTargetIds: PlayerId[];
  /** Optional weapon checks already offered for this Slash/target. */
  readonly zhuQueChecked: boolean;
  readonly ciXiongChecked: boolean;
  /** Per-target standard-skill timing that survives reconnects and redirects. */
  readonly liuliCheckedPlayerIds?: PlayerId[];
  readonly tieqiChecked?: boolean;
  /** Every declared/replacement target already belonging to this physical Slash. */
  readonly excludedRedirectTargetIds?: PlayerId[];
  /** A successful Tieqi judgment makes every form of Dodge response illegal. */
  readonly dodgeProhibited?: boolean;
  /** Missing only on legacy v1 snapshots; clone/persistence normalize it to default. */
  readonly completion?: SlashResolutionContinuation;
}

export type WeaponActionStage =
  | "zhuque_convert"
  | "cixiong_activate"
  | "cixiong_choice"
  | "guanshi_force_hit"
  | "qinglong_followup"
  | "hanbing_prevent"
  | "hanbing_select"
  | "qilin_discard_horse";

export interface PendingWeaponAction {
  readonly type: "weapon_action";
  readonly weaponKind: Extract<WeaponCardKind,
    "zhu_que_yu_shan" | "ci_xiong_shuang_gu_jian" | "guan_shi_fu" |
    "qing_long_yan_yue_dao" | "han_bing_jian" | "qi_lin_gong">;
  readonly stage: WeaponActionStage;
  readonly attackerId: PlayerId;
  /** Player who must make the weapon decision. */
  readonly targetId: PlayerId;
  readonly victimId: PlayerId;
  readonly slash: PendingSlashResponse;
  readonly remainingSelections?: number;
}

export interface PendingDuelResponse extends LordDispatchAttemptState {
  readonly type: "duel";
  /** The opponent whose last challenge/Slash the current target must answer. */
  readonly attackerId: PlayerId;
  /** The player who must now play a Slash or pass. */
  readonly targetId: PlayerId;
  readonly cardId: CardId;
  readonly initiatorId: PlayerId;
  readonly originalTargetId: PlayerId;
  /** Slash responses needed before initiative changes (2 when the opponent has Wushuang). */
  readonly requiredSlashCount?: number;
  /** Slash responses already accepted in the current Duel exchange. */
  readonly slashesPlayed?: number;
}

/** A recoverable Fanjian suit declaration made before its random hand transfer. */
export interface PendingFanjianSuitChoice {
  readonly type: "fanjian_suit";
  /** Zhou Yu, whose hand supplies the random revealed card and any damage. */
  readonly attackerId: PlayerId;
  /** The chosen target who must declare a suit. */
  readonly targetId: PlayerId;
  readonly eventId: number;
  /** Required on resolution so stale/replayed declarations cannot consume RNG. */
  readonly promptId: string;
}

export interface PendingMassAttackResponse extends LordDispatchAttemptState {
  readonly type: "mass_attack";
  readonly attackerId: PlayerId;
  /** The player currently resolving the mass attack. */
  readonly targetId: PlayerId;
  readonly cardId: CardId;
  readonly cardKind: "barbarian_invasion" | "arrow_barrage";
  readonly responseKind: "slash" | "dodge";
  /** Remaining living targets in circular seat order after targetId. */
  readonly remainingTargetIds: PlayerId[];
  readonly armorAttempted?: boolean;
}

export type PendingTrickEffect =
  | { readonly type: "ex_nihilo"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly cardId: CardId }
  | { readonly type: "duel"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly cardId: CardId }
  | { readonly type: "mass_attack"; readonly pending: PendingMassAttackResponse }
  | { readonly type: "peach_garden"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly cardId: CardId; readonly remainingTargetIds: PlayerId[] }
  | { readonly type: "delayed_trick"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly cardId: CardId; readonly cardKind: "le_bu_si_shu" | "bing_liang_cun_duan" | "shan_dian" }
  | { readonly type: "zone_trick"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly cardId: CardId; readonly cardKind: "guo_he_chai_qiao" | "shun_shou_qian_yang" }
  | { readonly type: "fire_attack"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly cardId: CardId }
  | { readonly type: "borrowed_sword"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly attackTargetId: PlayerId; readonly cardId: CardId }
  | { readonly type: "iron_chain"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly cardId: CardId; readonly remainingTargetIds: PlayerId[] }
  | { readonly type: "amazing_grace"; readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly cardId: CardId; readonly pool: Card[]; readonly remainingTargetIds: PlayerId[] };

export interface PendingNullificationResponse {
  readonly type: "nullification";
  readonly attackerId: PlayerId;
  /** Player currently allowed to play 无懈可击. */
  readonly targetId: PlayerId;
  readonly effectTargetId: PlayerId;
  readonly cardId: CardId;
  readonly cardKind: "ex_nihilo" | "duel" | "barbarian_invasion" | "arrow_barrage" | "peach_garden" | "le_bu_si_shu" | "bing_liang_cun_duan" | "shan_dian" | "guo_he_chai_qiao" | "shun_shou_qian_yang" | "fire_attack" | "amazing_grace" | "borrowed_sword" | "iron_chain";
  readonly remainingResponderIds: PlayerId[];
  readonly negated: boolean;
  readonly effect: PendingTrickEffect;
}

export interface PendingZoneSelection {
  readonly type: "zone_selection";
  readonly attackerId: PlayerId;
  /** The trick user who must choose a card from victimId. */
  readonly targetId: PlayerId;
  readonly victimId: PlayerId;
  readonly cardId: CardId;
  readonly cardKind: "guo_he_chai_qiao" | "shun_shou_qian_yang";
  readonly mode: "discard" | "gain";
}

export interface PendingFireAttackReveal {
  readonly type: "fire_attack_reveal";
  readonly attackerId: PlayerId;
  /** The Fire Attack victim who must reveal one hand card. */
  readonly targetId: PlayerId;
  readonly cardId: CardId;
}

export interface PendingFireAttackDiscard {
  readonly type: "fire_attack_discard";
  readonly attackerId: PlayerId;
  /** The Fire Attack user who may discard a matching-suit card. */
  readonly targetId: PlayerId;
  readonly victimId: PlayerId;
  readonly cardId: CardId;
  readonly revealedCardId: CardId;
}

export interface PendingAmazingGraceSelection {
  readonly type: "amazing_grace_selection";
  readonly attackerId: PlayerId;
  readonly targetId: PlayerId;
  readonly cardId: CardId;
  readonly pool: Card[];
  readonly remainingTargetIds: PlayerId[];
}

export interface PendingBorrowedSwordResponse extends LordDispatchAttemptState {
  readonly type: "borrowed_sword";
  readonly attackerId: PlayerId;
  /** The weapon holder who must use a Slash or surrender their weapon. */
  readonly targetId: PlayerId;
  readonly attackTargetId: PlayerId;
  readonly cardId: CardId;
}

export type LordDispatchableResponse =
  | PendingSlashResponse
  | PendingDuelResponse
  | PendingMassAttackResponse
  | PendingBorrowedSwordResponse;

export type LordDispatchResume =
  | { readonly type: "respond"; readonly pending: LordDispatchableResponse }
  | { readonly type: "use_slash"; readonly targetIds: PlayerId[] };

/**
 * Serializable, server-authoritative 护驾/激将 provider chain. The provider's
 * physical card remains attributable to providerId while the resulting use or
 * response is attributable to requesterId.
 */
export interface PendingLordDispatch {
  readonly type: "lord_dispatch";
  readonly requesterId: PlayerId;
  /** Current same-faction provider who must play a physical card or pass. */
  readonly targetId: PlayerId;
  readonly skillId: LordDispatchSkillId;
  readonly requiredFaction: Extract<Faction, "wei" | "shu">;
  readonly responseKind: "slash" | "dodge";
  readonly method: "use" | "respond";
  readonly eventId: number;
  readonly promptId: string;
  readonly remainingProviderIds: PlayerId[];
  readonly resume: LordDispatchResume;
}

export type DyingResume =
  | { readonly type: "finish_effect" }
  | { readonly type: "skill"; readonly skillId: "kurou"; readonly playerId: PlayerId }
  | { readonly type: "mass_attack"; readonly pending: PendingMassAttackResponse }
  | { readonly type: "turn_start" }
  /**
   * Internal cursor used only while an authoritative DamageFlow frame is
   * paused at its inserted dying barrier. The original game continuation is
   * retained by the root damage frame and must not be embedded here.
   */
  | {
      readonly type: "damage_flow";
      readonly frameId: number;
      readonly damageId: number;
      readonly dyingId: number;
    }
  | {
      readonly type: "chain_damage";
      readonly sourceId: PlayerId | null;
      readonly amount: number;
      readonly nature: Exclude<DamageNature, "normal">;
      readonly damageCardIds?: CardId[];
      readonly remainingTargetIds: PlayerId[];
      readonly finalResume: Exclude<DyingResume, { type: "chain_damage" | "damage_flow" }>;
    }
  | { readonly type: "slash_sequence"; readonly pending: PendingSlashResponse }
  | { readonly type: "standard_damage"; readonly aftermath: StandardDamageAftermath };

export interface PendingDyingResponse {
  readonly type: "dying";
  readonly victimId: PlayerId;
  /** Null for source-less HP loss such as Kurou. */
  readonly damageSourceId: PlayerId | null;
  /** Player currently allowed to provide one rescue card. */
  readonly targetId: PlayerId;
  readonly remainingResponderIds: PlayerId[];
  readonly resume: DyingResume;
}

export type StandardImplementedSkillId = Extract<GeneralSkillId,
  "jianxiong" | "tiandu" | "yiji" | "guicai" | "fankui" |
  "ganglie" | "tuxi" | "guanxing" | "tieqi" | "liuli">;

/** The exact post-damage trigger chain, including cards that may still be in processing. */
export interface StandardDamageAftermath {
  readonly eventId: number;
  readonly sourceId: PlayerId | null;
  readonly targetId: PlayerId;
  readonly amount: number;
  readonly damageCardIds: CardId[];
  readonly remainingSkillIds: StandardImplementedSkillId[];
  readonly resume: DyingResume;
}

export type StandardJudgmentContext =
  | { readonly type: "delayed_trick"; readonly playerId: PlayerId; readonly delayedCard: Card }
  | { readonly type: "luoshen"; readonly playerId: PlayerId; readonly iteration: number }
  | { readonly type: "ganglie"; readonly aftermath: StandardDamageAftermath }
  | { readonly type: "tieqi"; readonly slash: PendingSlashResponse }
  | { readonly type: "armor"; readonly pending: PendingSlashResponse | PendingMassAttackResponse };

export interface PendingStandardJudgment {
  readonly type: "standard_judgment";
  /** Current retrial/post-judgment actor, or the judged player while resolving internally. */
  readonly targetId: PlayerId;
  readonly promptId: string;
  readonly frame: JudgmentFrame;
  readonly context: StandardJudgmentContext;
  readonly tianduClaimed: boolean;
}

export type StandardSkillStage =
  | "invoke"
  | "guanxing_reorder"
  | "tuxi_select"
  | "yiji_distribute"
  | "fankui_select"
  | "ganglie_punish"
  | "liuli_redirect";

/** One generic, strictly tagged pause covers all ten standard/SP skill verticals. */
export interface PendingStandardSkill {
  readonly type: "standard_skill";
  readonly targetId: PlayerId;
  readonly promptId: string;
  readonly eventId: number;
  readonly skillId: StandardImplementedSkillId;
  readonly stage: StandardSkillStage;
  readonly aftermath?: StandardDamageAftermath;
  readonly slash?: PendingSlashResponse;
  readonly sourceId?: PlayerId;
  readonly selectedCardIds?: CardId[];
  readonly iteration?: number;
}

export type CardUseMethod = "use" | "respond" | "recast";
export type CardUseEventStage = "card_use_declared" | "targets_confirmed";

/** A fully validated, JSON-safe declaration of one physical card use. */
export interface CardUseIntent {
  readonly useId: number;
  readonly sourceId: PlayerId;
  readonly physicalCardId: CardId;
  readonly physicalKind: CardKind;
  readonly effectiveKind: CardKind;
  readonly suit: CardSuit;
  readonly rank: CardRank;
  readonly targetIds: PlayerId[];
  readonly method: CardUseMethod;
  readonly viaSkill: GeneralSkillId | null;
}

/** Stable trigger metadata; consumed refs are removed instead of regenerated. */
export interface SkillTriggerRef {
  readonly triggerId: string;
  readonly eventId: number;
  readonly ownerId: PlayerId;
  readonly skillId: GeneralSkillId;
  readonly targetIndex: number;
  readonly mandatory: boolean;
}

/** Serializable continuation for the pre-commit card-use event pipeline. */
export interface CardUseContinuation {
  readonly type: "card_use";
  readonly intent: CardUseIntent;
  readonly stage: CardUseEventStage;
  readonly eventId: number;
  readonly remainingTriggers: SkillTriggerRef[];
}

/** Resume token for an optional trigger produced by an already committed move. */
export interface AfterMoveContinuation {
  readonly type: "after_move";
  readonly eventId: number;
}

export type SkillChoiceId = Extract<GeneralSkillId,
  "luoyi" | "keji" | "yingzi" | "biyue" | "luoshen" | "jizhi" | "lianying" | "xiaoji">;

export type SkillChoiceResume =
  | { readonly type: "finish_draw"; readonly playerId: PlayerId }
  | { readonly type: "enter_discard"; readonly playerId: PlayerId; readonly count: number }
  | { readonly type: "continue_judgment"; readonly playerId: PlayerId }
  | { readonly type: "finish_turn"; readonly playerId: PlayerId }
  | AfterMoveContinuation
  | CardUseContinuation;

/** A serializable pause for an optional general skill decision. */
export interface PendingSkillChoice {
  readonly type: "skill_choice";
  readonly targetId: PlayerId;
  readonly skillId: SkillChoiceId;
  readonly resume: SkillChoiceResume;
  /** Required for event-driven prompts so stale/replayed resolutions are rejected. */
  readonly promptId?: string;
  readonly triggerId?: string;
  /** Zero for the first offer; incremented after every successful Luoshen judgment. */
  readonly iteration?: number;
}

export type PendingResponse =
  | PendingSlashResponse
  | PendingDuelResponse
  | PendingFanjianSuitChoice
  | PendingMassAttackResponse
  | PendingNullificationResponse
  | PendingZoneSelection
  | PendingFireAttackReveal
  | PendingFireAttackDiscard
  | PendingAmazingGraceSelection
  | PendingBorrowedSwordResponse
  | PendingLordDispatch
  | PendingWeaponAction
  | PendingDyingResponse
  | PendingSkillChoice
  | PendingStandardJudgment
  | PendingStandardSkill;

/**
 * Deferred optional triggers emitted by committed hand/equipment movement.
 * A generated prompt temporarily suspends the response produced by the same
 * atomic action, so the move trigger resolves before that response continues.
 */
export interface AfterMoveState {
  queuedTriggers: SkillTriggerRef[];
  suspendedPhase: TurnPhase | null;
  suspendedResponse: PendingResponse | null;
}

export type WinnerSide = "lord" | "rebel" | "renegade";

export interface GameWinner {
  readonly side: WinnerSide;
  readonly playerIds: PlayerId[];
}

export type PublicLogType =
  | "system"
  | "turn"
  | "card"
  | "damage"
  | "death"
  | "victory";

export interface PublicLog {
  readonly id: number;
  readonly type: PublicLogType;
  readonly message: string;
}

/**
 * Complete authoritative state for exactly one room. It contains private data
 * and must never be sent to a browser directly. Every field is JSON-safe.
 */
export interface GameSession {
  readonly version: 1;
  status: GameStatus;
  players: GamePlayer[];
  deck: Card[];
  discardPile: Card[];
  /** Cards whose effects are still resolving; they cannot be reshuffled yet. */
  resolvingCards: Card[];
  /** Original physical kinds for virtual cards currently resolving or in judgment zones. */
  virtualCardOrigins: Partial<Record<CardId, CardKind>>;
  currentPlayerId: PlayerId;
  turn: TurnState;
  pendingResponse: PendingResponse | null;
  winner: GameWinner | null;
  logs: PublicLog[];
  /** Secret server-only ChaCha20 stream state; never expose through GameView. */
  rng: {
    readonly key: string;
    readonly counter: number;
  };
  nextLogId: number;
  /** Monotonic identifiers for serializable card-use/event frames. */
  nextUseId: number;
  nextEventId: number;
  /** Serializable after-move trigger queue and any response it interrupted. */
  afterMove: AfterMoveState;
  /** Serializable foundation for the complete 66-general rule engine. */
  completeRules: CompleteRulesEngineState;
}

export interface CreateGameInput {
  readonly playerIds: PlayerId[];
  /** A server-generated 256-bit seed encoded as exactly 64 hexadecimal characters. */
  readonly seed: string;
}

export type RoleDistribution = Readonly<Record<Role, number>>;

export type GameAction =
  | {
      readonly type: "play_card";
      readonly playerId: PlayerId;
      readonly cardId: CardId;
      /** Required for a Slash or Duel; omitted for cards without a chosen target. */
      readonly targetId?: PlayerId;
      /** Ordered targets for cards that select more than one role. */
      readonly targetIds?: PlayerId[];
    }
  | {
      readonly type: "respond";
      readonly playerId: PlayerId;
      /** Omit/null to decline the requested Slash or Dodge. */
      readonly cardId?: CardId | null;
      /** Two hand cards used as a virtual Slash through Zhang Ba Serpent Spear. */
      readonly cardIds?: CardId[];
    }
  | { readonly type: "use_zhang_ba_slash"; readonly playerId: PlayerId; readonly cardIds: CardId[]; readonly targetId: PlayerId }
  | { readonly type: "activate_armor"; readonly playerId: PlayerId; readonly activate: boolean }
  | {
      readonly type: "end_play";
      readonly playerId: PlayerId;
    }
  | {
      readonly type: "discard";
      readonly playerId: PlayerId;
      readonly cardIds: CardId[];
    }
  | { readonly type: "choose_zone_card"; readonly playerId: PlayerId; readonly token: string }
  | { readonly type: "choose_hand_card"; readonly playerId: PlayerId; readonly cardId?: CardId | null }
  | { readonly type: "choose_amazing_grace_card"; readonly playerId: PlayerId; readonly cardId: CardId }
  | {
      readonly type: "use_skill";
      readonly playerId: PlayerId;
      readonly skillId: Extract<GeneralSkillId,
        "wusheng" | "longdan" | "qixi" | "kurou" | "zhiheng" | "rende" |
        "qingnang" | "jieyin" | "guose" | "qingguo" | "jijiu" | "fanjian" | "lijian">;
      readonly cardIds?: CardId[];
      readonly targetId?: PlayerId;
      readonly targetIds?: PlayerId[];
    }
  | {
      readonly type: "invoke_lord_skill";
      readonly playerId: PlayerId;
      readonly skillId: LordDispatchSkillId;
      /** Required only when 激将 is used proactively in the play phase. */
      readonly targetId?: PlayerId;
    }
  | {
      readonly type: "resolve_lord_dispatch";
      readonly playerId: PlayerId;
      readonly promptId: string;
      /** Null/omitted passes; otherwise it must be a physical matching hand card. */
      readonly cardId?: CardId | null;
    }
  | {
      readonly type: "choose_fanjian_suit";
      readonly playerId: PlayerId;
      readonly suit: CardSuit;
      readonly promptId: string;
    }
  | {
      readonly type: "resolve_skill";
      readonly playerId: PlayerId;
      readonly skillId: SkillChoiceId;
      readonly activate: boolean;
      readonly promptId?: string;
    }
  | {
      readonly type: "resolve_standard_skill";
      readonly playerId: PlayerId;
      readonly promptId: string;
      readonly activate: boolean;
      readonly cardId?: CardId;
      readonly cardIds?: CardId[];
      readonly targetId?: PlayerId;
      readonly targetIds?: PlayerId[];
      readonly tokens?: string[];
      readonly topCardIds?: CardId[];
      readonly bottomCardIds?: CardId[];
      readonly allocations?: ReadonlyArray<{ readonly cardId: CardId; readonly targetId: PlayerId }>;
    }
  | {
      readonly type: "resolve_weapon";
      readonly playerId: PlayerId;
      readonly activate: boolean;
      readonly cardIds?: CardId[];
      readonly tokens?: string[];
    };

export interface GameViewPlayer {
  readonly id: PlayerId;
  readonly seat: number;
  readonly alive: boolean;
  readonly faceUp: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly handCount: number;
  /** Only populated for the player viewing their own game. */
  readonly hand: Card[] | null;
  readonly equipment: Card[];
  readonly judgment: Card[];
  readonly chained: boolean;
  /** Self, the public lord, dead players, and all players after game over are visible. */
  readonly role: Role | null;
  readonly general: {
    readonly id: GeneralId;
    readonly name: string;
    readonly faction: Faction;
    readonly gender: Gender;
  } | null;
  /** Public, dynamically refreshed skill set after lord-only gating and 伪帝. */
  readonly effectiveSkillIds: GeneralSkillId[];
}

export type TargetMode = "none" | "self" | "single-other" | "up-to-two" | "up-to-three" | "ordered-two";
export type PlayableCardKind = Exclude<CardKind, "dodge">;

export interface PlayableCardHint {
  readonly cardId: CardId;
  readonly kind: PlayableCardKind;
  readonly targetMode: TargetMode;
  /** Legal explicit targets. Empty for cards with targetMode "none". */
  readonly targetIds: PlayerId[];
  /** Legal ordered pairs for cards such as 借刀杀人. */
  readonly targetPairs?: ReadonlyArray<readonly [PlayerId, PlayerId]>;
}

export interface PlayableSkillHint {
  readonly skillId: Extract<GeneralSkillId,
    "wusheng" | "longdan" | "qixi" | "kurou" | "zhiheng" | "rende" |
    "qingnang" | "jieyin" | "guose" | "fanjian" | "lijian" | "jijiang">;
  readonly cardIds: CardId[];
  readonly minCards: number;
  readonly maxCards: number;
  readonly targetMode: TargetMode;
  readonly targetIds: PlayerId[];
  /** Legal ordered target pairs for two-role active skills such as Lijian. */
  readonly targetPairs?: ReadonlyArray<readonly [PlayerId, PlayerId]>;
  /** Per-cost target legality when paying with an equipped card changes distance/range. */
  readonly cardTargetIds?: Readonly<Record<CardId, PlayerId[]>>;
  readonly virtualCardKind?: "slash" | "guo_he_chai_qiao" | "le_bu_si_shu";
}

export interface SkillResponseHint {
  readonly skillId: Extract<GeneralSkillId, "wusheng" | "longdan" | "qingguo" | "jijiu">;
  readonly cardIds: CardId[];
  readonly responseKind: "slash" | "dodge" | "peach";
}

export type ResponseContext =
  | "slash"
  | "duel"
  | "barbarian_invasion"
  | "arrow_barrage"
  | "borrowed_sword";

export type GamePrompt =
  | {
      readonly type: "play";
      readonly playerId: PlayerId;
      readonly cards: PlayableCardHint[];
      readonly skills: PlayableSkillHint[];
      readonly zhangBaSlash?: { readonly allowedCardIds: CardId[]; readonly targetIds: PlayerId[] } | null;
    }
  | {
      readonly type: "fanjian_suit";
      readonly playerId: PlayerId;
      readonly sourceId: PlayerId;
      readonly promptId: string;
      readonly suits: CardSuit[];
    }
  | {
      readonly type: "respond";
      readonly playerId: PlayerId;
      /** The damage source/opponent whose effect is being answered. */
      readonly attackerId: PlayerId;
      readonly targetId: PlayerId;
      readonly context: ResponseContext;
      readonly responseKind: "slash" | "dodge";
      readonly allowedCardIds: CardId[];
      /** Compatibility field for the original Slash -> Dodge UI. */
      readonly dodgeCardIds: CardId[];
      /** Slash-family cards accepted by Duel or 南蛮入侵. */
      readonly slashCardIds: CardId[];
      readonly zhangBaCardIds?: CardId[];
      readonly skillResponses: SkillResponseHint[];
      /** Number of responses required in the current Slash/Duel exchange. */
      readonly requiredCount: number;
      /** Number already accepted; allows clients to restore multi-response prompts safely. */
      readonly respondedCount: number;
      readonly canPass: true;
      /** Available requester-side lord dispatches for this exact response. */
      readonly lordSkills: LordDispatchSkillId[];
    }
  | {
      readonly type: "lord_dispatch";
      readonly playerId: PlayerId;
      readonly requesterId: PlayerId;
      readonly skillId: LordDispatchSkillId;
      readonly responseKind: "slash" | "dodge";
      readonly method: "use" | "respond";
      readonly promptId: string;
      readonly allowedCardIds: CardId[];
      readonly canPass: true;
    }
  | {
      readonly type: "armor";
      readonly playerId: PlayerId;
      readonly armorKind: "ba_gua_zhen";
      readonly requiredCount: number;
      readonly respondedCount: number;
      readonly canPass: true;
    }
  | {
      readonly type: "nullification";
      readonly playerId: PlayerId;
      readonly sourceId: PlayerId;
      readonly effectTargetId: PlayerId;
      readonly cardKind: PendingNullificationResponse["cardKind"];
      readonly allowedCardIds: CardId[];
      readonly canPass: true;
    }
  | {
      readonly type: "zone_selection";
      readonly playerId: PlayerId;
      readonly victimId: PlayerId;
      readonly mode: "discard" | "gain";
      readonly choices: ReadonlyArray<{
        readonly token: string;
        readonly zone: "hand" | "equipment" | "judgment";
        /** Hidden hand choices are anonymous; public zones include card metadata. */
        readonly card: Card | null;
      }>;
    }
  | {
      readonly type: "fire_attack_reveal";
      readonly playerId: PlayerId;
      readonly sourceId: PlayerId;
      readonly allowedCardIds: CardId[];
    }
  | {
      readonly type: "fire_attack_discard";
      readonly playerId: PlayerId;
      readonly victimId: PlayerId;
      readonly revealedCard: Card;
      readonly allowedCardIds: CardId[];
      readonly canPass: true;
    }
  | {
      readonly type: "amazing_grace_selection";
      readonly playerId: PlayerId;
      readonly cards: Card[];
    }
  | {
      readonly type: "weapon_action";
      readonly playerId: PlayerId;
      readonly weaponKind: PendingWeaponAction["weaponKind"];
      readonly stage: WeaponActionStage;
      readonly victimId: PlayerId;
      readonly allowedCardIds: CardId[];
      readonly minCards: number;
      readonly maxCards: number;
      readonly canPass: boolean;
      readonly choices?: ReadonlyArray<{
        readonly token: string;
        readonly zone: "hand" | "equipment";
        readonly card: Card | null;
      }>;
    }
  | {
      readonly type: "dying";
      readonly playerId: PlayerId;
      readonly victimId: PlayerId;
      readonly allowedCardIds: CardId[];
      readonly peachCardIds: CardId[];
      readonly wineCardIds: CardId[];
      readonly skillResponses: SkillResponseHint[];
      readonly canPass: true;
    }
  | {
      readonly type: "skill_choice";
      readonly playerId: PlayerId;
      readonly skillId: SkillChoiceId;
      /** Authoritative identifier for event-driven skill choices. */
      readonly promptId?: string;
      /** Present for repeatable choices such as Luoshen so clients can key every prompt. */
      readonly iteration?: number;
      readonly canPass: true;
    }
  | {
      readonly type: "standard_skill";
      readonly playerId: PlayerId;
      readonly skillId: StandardImplementedSkillId;
      readonly stage: StandardSkillStage | "judgment_retrial" | "judgment_post";
      readonly promptId: string;
      readonly canPass: boolean;
      readonly cards: Card[];
      readonly allowedCardIds: CardId[];
      readonly targetIds: PlayerId[];
      readonly minCards: number;
      readonly maxCards: number;
      readonly minTargets: number;
      readonly maxTargets: number;
      readonly choices?: ReadonlyArray<{
        readonly token: string;
        readonly ownerId: PlayerId;
        readonly zone: "hand" | "equipment";
        readonly card: Card | null;
      }>;
      readonly cardTargetIds?: Readonly<Record<CardId, PlayerId[]>>;
    }
  | {
      readonly type: "discard";
      readonly playerId: PlayerId;
      readonly count: number;
      readonly cardIds: CardId[];
    }
  | { readonly type: "waiting" }
  | { readonly type: "finished"; readonly winner: GameWinner };

/** Browser-safe projection. Hidden hands and identities are replaced with null. */
export interface GameView {
  readonly version: 1;
  readonly status: GameStatus;
  readonly players: GameViewPlayer[];
  readonly deckCount: number;
  readonly discardPile: Card[];
  /** Cards that are public during the current multi-step trick resolution. */
  readonly publicCards: Card[];
  readonly currentPlayerId: PlayerId;
  readonly turn: TurnState;
  readonly pendingResponse: PendingResponse | null;
  readonly winner: GameWinner | null;
  readonly logs: PublicLog[];
  readonly prompt: GamePrompt;
}

export type GameRuleErrorCode =
  | "INVALID_PLAYER_COUNT"
  | "INVALID_PLAYER_ID"
  | "INVALID_SEED"
  | "DUPLICATE_PLAYER"
  | "GAME_FINISHED"
  | "UNKNOWN_PLAYER"
  | "PLAYER_DEAD"
  | "NOT_YOUR_TURN"
  | "INVALID_PHASE"
  | "CARD_NOT_FOUND"
  | "INVALID_CARD"
  | "INVALID_TARGET"
  | "INVALID_SELECTION"
  | "INVALID_SKILL"
  | "DUPLICATE_DELAYED_TRICK"
  | "SLASH_ALREADY_USED"
  | "WINE_ALREADY_USED"
  | "FULL_HEALTH"
  | "INVALID_RESPONSE"
  | "INVALID_DISCARD";
