import {
  FULL_GENERAL_CATALOG,
  getFullGeneralDefinition,
  type FullGeneralSkillCategory,
} from "../full-general-catalog.js";
import { isFullGeneralId, type FullGeneralId } from "../full-general-ids.js";
import {
  FULL_SKILL_RULE_IDS,
  isFullSkillRulesId,
  type FullSkillRulesId,
} from "../full-skill-ids.js";

/** Display-only rules copy. This catalog does not imply that a rule is live in the engine. */
const RULE_TEXT_BY_ID = {
  baiyin: "觉醒技，准备阶段开始时，若你拥有至少四枚“忍”标记，你减1点体力上限，然后获得“极略”。",
  baonue: "主公技，当其他群势力角色造成伤害后，其可以进行判定：若结果为黑桃，你回复1点体力。",
  bazhen: "锁定技，若你的装备区里没有防具牌，你视为装备着【八卦阵】。",
  beige: "当一名角色受到【杀】造成的伤害后，你可以弃置一张牌，令其进行判定：若结果为红桃，其回复1点体力；方块，其摸两张牌；梅花，伤害来源弃置两张牌；黑桃，伤害来源翻面。",
  benghuai: "锁定技，结束阶段开始时，若你不是体力值最小的角色，你选择失去1点体力或减1点体力上限。",
  biyue: "结束阶段开始时，你可以摸一张牌。",
  buqu: "当你扣减体力至0或更低时，你可以将牌堆顶的一张牌置于你的武将牌上，称为“创”；若“创”中没有点数相同的牌，你不进入濒死状态。每扣减1点体力重复此流程。",
  dawu: "结束阶段开始时，你可以移去任意张“星”并选择等量的角色；直到你的下回合开始前，防止这些角色受到的非雷电伤害。",
  dimeng: "出牌阶段限一次，你可以选择两名其他角色并弃置X张牌，然后令这两名角色交换手牌（X为其手牌数之差的绝对值）。",
  duanchang: "锁定技，当你死亡时，杀死你的角色失去其当前拥有的所有武将技能。",
  duanliang: "你可以将一张黑色基本牌或装备牌当【兵粮寸断】使用；你使用【兵粮寸断】可以指定距离为2的角色。",
  fangquan: "你可以跳过出牌阶段。若如此做，此回合结束时，你可以弃置一张手牌并令一名其他角色获得一个额外回合。",
  fangzhu: "当你受到1点伤害后，你可以令一名其他角色翻面，然后其摸X张牌（X为你已损失的体力值）。",
  fanjian: "出牌阶段限一次，你可以令一名其他角色选择一种花色，然后其随机获得你的一张手牌并展示之；若此牌花色与其选择的花色不同，你对其造成1点伤害。",
  fankui: "当你受到1点伤害后，你可以获得伤害来源区域里的一张牌。",
  feiying: "锁定技，其他角色计算与你的距离+1。",
  ganglie: "当你受到1点伤害后，你可以进行判定：若结果不为红桃，伤害来源选择弃置两张手牌或受到你造成的1点伤害。",
  gongxin: "出牌阶段限一次，你可以观看一名其他角色的手牌，然后可以展示其中一张红桃牌，并选择弃置此牌或将其置于牌堆顶。",
  guanxing: "准备阶段开始时，你可以观看牌堆顶的X张牌（X为存活角色数且至多为5），然后将其中任意张以任意顺序置于牌堆顶，其余以任意顺序置于牌堆底。",
  guhuo: "你可以声明任意一种基本牌或普通锦囊牌，并将一张手牌扣置后当所声明的牌使用或打出。其他体力值不为0的角色依座次选择是否质疑；无人质疑时按声明结算。有人质疑时亮出该牌：若声明为真，质疑者各失去1点体力；若声明为假，质疑者各摸一张牌。被质疑的牌均须弃置，只有牌面与声明相符且花色为红桃时仍按声明继续结算。",
  guicai: "当一名角色的判定牌生效前，你可以打出一张手牌代替之。",
  guidao: "当一名角色的判定牌生效前，你可以打出一张黑色牌代替之。",
  guixin: "当你受到1点伤害后，你可以依次获得每名其他角色区域里的一张牌，然后你翻面。",
  guose: "你可以将一张方块牌当【乐不思蜀】使用。",
  guzheng: "其他角色的弃牌阶段结束后，你可以将此阶段中进入弃牌堆的一张牌返还给该角色，然后获得其余仍在弃牌堆中的这些牌。",
  haoshi: "摸牌阶段，你可以多摸两张牌；若如此做，摸牌阶段结束时若你的手牌数大于5，你须将一半手牌（向下取整）交给手牌数最少的一名其他角色。",
  hongyan: "锁定技，你的黑桃牌均视为红桃牌。",
  huangtian: "主公技，其他群势力角色的出牌阶段限一次，其可以将一张【闪】或【闪电】交给你。",
  huashen: "游戏开始时，你随机获得两张未登场的武将牌作为“化身”，展示其中一张并获得该武将牌上的一个技能。你的回合开始时或结束后，你可以更换展示的“化身”及获得的技能。",
  hujia: "主公技，当你需要使用或打出【闪】时，你可以依座次询问其他魏势力角色是否代你打出一张【闪】；此【闪】视为由你使用或打出。",
  hunzi: "觉醒技，准备阶段开始时，若你的体力值为1，你减1点体力上限，然后获得“英姿”和“英魂”。",
  huoji: "你可以将一张红色手牌当【火攻】使用。",
  huoshou: "锁定技，【南蛮入侵】对你无效；其他角色使用的【南蛮入侵】造成伤害时，你代替使用者成为伤害来源。",
  jiang: "当你使用【决斗】或红色【杀】指定目标后，或成为【决斗】或红色【杀】的目标后，你可以摸一张牌。",
  jianxiong: "当你受到伤害后，你可以获得对你造成此次伤害的牌。",
  jieming: "当你受到1点伤害后，你可以令一名角色将手牌摸至X张（X为其体力上限且至多为5）。",
  jieyin: "出牌阶段限一次，你可以弃置两张手牌并选择一名已受伤的男性角色，令你与其各回复1点体力。",
  jijiang: "主公技，当你需要使用或打出【杀】时，你可以依座次询问其他蜀势力角色是否代你打出一张【杀】；此【杀】视为由你使用或打出。",
  jijiu: "你的回合外，你可以将一张红色牌当【桃】使用。",
  jilue: "你可以弃置一枚“忍”标记，发动“鬼才”“放逐”“集智”“制衡”或“完杀”中的一项；所选技能仍遵循其原有发动时机与次数限制。",
  jiuchi: "你可以将一张黑桃手牌当【酒】使用。",
  jiuyuan: "主公技，锁定技，其他吴势力角色对你使用【桃】时，此【桃】令你回复的体力+1。",
  jixi: "你可以将一张“田”当【顺手牵羊】使用。",
  jizhi: "当你使用普通锦囊牌时，你可以摸一张牌。",
  juejing: "锁定技，摸牌阶段你多摸X张牌（X为你已损失的体力值）；你的手牌上限+2。",
  jushou: "结束阶段开始时，你可以翻面并摸四张牌，然后选择弃置一张非装备牌，或使用一张装备牌。",
  juxiang: "锁定技，【南蛮入侵】对你无效；其他角色使用的实体【南蛮入侵】结算结束后，若其仍在处理区，你获得之。",
  kanpo: "你可以将一张黑色手牌当【无懈可击】使用。",
  keji: "若你于出牌阶段内没有使用或打出过【杀】，你可以跳过弃牌阶段。",
  kongcheng: "锁定技，若你没有手牌，你不能成为【杀】或【决斗】的目标。",
  kuangbao: "锁定技，游戏开始时，你获得两枚“暴怒”标记；每当你造成或受到1点伤害后，你获得一枚“暴怒”标记。",
  kuangfeng: "结束阶段开始时，你可以移去一张“星”并选择一名角色；直到你的下回合开始前，该角色受到的火焰伤害+1。",
  kuanggu: "锁定技，当你对距离1以内的一名角色造成1点伤害后，你回复1点体力。",
  kurou: "出牌阶段，你可以失去1点体力，然后摸两张牌。",
  leiji: "当你使用或打出【闪】时，你可以令一名角色进行判定；若结果为黑桃，你对其造成2点雷电伤害。",
  lianhuan: "你可以将一张梅花手牌当【铁索连环】使用或重铸。",
  lianpo: "当你于一名角色的回合内杀死角色后，此回合结束后你可以获得一个额外回合。",
  lianying: "当你失去最后一张手牌后，你可以摸一张牌。",
  liegong: "当你使用【杀】指定一个目标后，若其手牌数不小于你的体力值，或不大于你的攻击范围，你可以令其不能使用【闪】响应此【杀】。",
  lieren: "当你使用【杀】对一名有手牌的角色造成伤害后，你可以与其拼点；若你赢，你获得其区域里的一张牌。",
  lijian: "出牌阶段限一次，你可以弃置一张牌并依次选择两名其他男性角色，视为第一名角色对第二名角色使用【决斗】；此【决斗】不能被【无懈可击】响应。",
  liuli: "当你成为【杀】的目标时，你可以弃置一张牌并选择你攻击范围内、且为此【杀】合法目标的一名其他角色，将此【杀】转移给该角色。",
  longdan: "你可以将【杀】当【闪】、【闪】当【杀】使用或打出。",
  longhun: "你可以将X张同花色牌按下列规则使用或打出：红桃当【桃】；方块当火【杀】；梅花当【闪】；黑桃当【无懈可击】（X为你的体力值且至少为1）。",
  luanji: "你可以将两张花色相同的手牌当【万箭齐发】使用。",
  luanwu: "限定技，出牌阶段，你可以令所有其他角色依次选择：对与其距离最小的另一名角色使用一张【杀】，或失去1点体力。",
  luoshen: "准备阶段开始时，你可以进行判定：若结果为黑色，你获得生效后的判定牌，并可以重复此流程，直到判定结果为红色或你停止发动。",
  luoyi: "摸牌阶段，你可以少摸一张牌；若如此做，本回合你使用【杀】或【决斗】造成的伤害+1。",
  mashu: "锁定技，你计算与其他角色的距离-1。",
  mengjin: "当你使用的【杀】被目标的【闪】抵消后，你可以弃置该目标的一张手牌或装备区里的牌。",
  niepan: "限定技，当你处于濒死状态时，你可以弃置区域内所有牌，重置武将牌和连环状态，然后摸三张牌并将体力回复至3点。",
  paoxiao: "锁定技，你于出牌阶段内使用【杀】无次数限制。",
  qiangxi: "出牌阶段限一次，你可以失去1点体力或弃置装备区里的一张武器牌，然后对你攻击范围内的一名其他角色造成1点伤害。",
  qianxun: "锁定技，你不能成为【顺手牵羊】或【乐不思蜀】的目标。",
  qiaobian: "你可以弃置一张手牌并跳过判定阶段、摸牌阶段、出牌阶段或弃牌阶段。若跳过摸牌阶段，你可以获得至多两名其他角色各一张手牌；若跳过出牌阶段，你可以将场上的一张牌移动到另一名角色区域内的合法位置。",
  qicai: "锁定技，你使用锦囊牌无距离限制。",
  qingguo: "你可以将一张黑色手牌当【闪】使用或打出。",
  qingnang: "出牌阶段限一次，你可以弃置一张手牌并令一名已受伤的角色回复1点体力。",
  qinyin: "弃牌阶段结束时，若你于此阶段弃置过至少两张手牌，你可以选择令所有角色各回复1点体力，或令所有角色各失去1点体力。",
  qixi: "你可以将一张黑色牌当【过河拆桥】使用。",
  qixing: "游戏开始时，你将牌堆顶七张牌扣置于武将牌上，称为“星”，然后可以用任意张手牌交换等量的“星”；摸牌阶段结束时，你也可以用任意张手牌交换等量的“星”。",
  quhu: "出牌阶段限一次，你可以与一名体力值大于你的角色拼点：若你赢，其对其攻击范围内由你选择的另一名角色造成1点伤害；若你没赢，其对你造成1点伤害。",
  rende: "出牌阶段，你可以将任意张手牌交给其他角色；当你于此阶段累计给出第二张手牌时，你回复1点体力。",
  renjie: "锁定技，当你受到1点伤害后，或于弃牌阶段弃置一张手牌后，你获得一枚“忍”标记。",
  roulin: "锁定技，你对女性角色使用的【杀】和女性角色对你使用的【杀】，均需连续使用两张【闪】才能抵消。",
  ruoyu: "主公技，觉醒技，准备阶段开始时，若你是体力值最小的角色，你加1点体力上限并回复1点体力，然后获得“激将”。",
  shelie: "摸牌阶段，你可以改为亮出牌堆顶五张牌，然后获得其中每种花色的牌各一张，其余牌置入弃牌堆。",
  shenfen: "出牌阶段限一次，你可以弃置六枚“暴怒”标记：对所有其他角色各造成1点伤害；这些角色再依次弃置装备区里的所有牌和四张手牌；最后你翻面。",
  shensu: "你可以选择：跳过判定阶段和摸牌阶段，视为对一名其他角色使用一张无距离限制的【杀】；或跳过出牌阶段并弃置一张装备牌，视为对一名其他角色使用一张无距离限制的【杀】。",
  shuangxiong: "摸牌阶段，你可以改为进行判定并获得生效后的判定牌；本回合你可以将一张与判定结果颜色不同的手牌当【决斗】使用。",
  songwei: "主公技，其他魏势力角色的黑色判定牌生效后，其可以令你摸一张牌。",
  tiandu: "你的判定牌生效后，你可以获得之。",
  tianxiang: "当你将受到伤害时，你可以弃置一张红桃手牌并选择一名其他角色，将此伤害转移给该角色；伤害结算后，其摸X张牌（X为其已损失的体力值）。",
  tianyi: "出牌阶段限一次，你可以与一名角色拼点：若你赢，本回合你使用【杀】的次数上限+1、无距离限制且可多选择一个目标；若你没赢，本回合你不能使用【杀】。",
  tiaoxin: "出牌阶段限一次，你可以选择一名攻击范围内含有你的角色；其选择对你使用一张【杀】，否则你弃置其区域里的一张牌。",
  tieqi: "当你使用【杀】指定目标后，你可以进行判定；若结果为红色，该目标不能使用【闪】响应此【杀】。",
  tuntian: "当你于回合外失去牌后，你可以进行判定；若结果不为红桃，将生效后的判定牌置于你的武将牌上，称为“田”。你计算与其他角色的距离-X（X为“田”的数量）。",
  tuxi: "摸牌阶段，你可以少摸至多两张牌，并选择等量的其他角色，依次获得这些角色各一张手牌。",
  wansha: "锁定技，你的回合内，除你和当前处于濒死状态的角色外，其他角色不能使用【桃】。",
  weidi: "锁定技，你视为拥有当前主公的所有主公技；主公技能发生获得或失去时，此效果同步变化。",
  weimu: "锁定技，你不能成为黑色锦囊牌的目标。",
  wuhun: "锁定技，当你受到1点伤害后，伤害来源获得一枚“梦魇”标记；当你死亡时，你选择一名拥有最多“梦魇”标记的其他角色进行判定，若结果不为【桃】或【桃园结义】，该角色死亡。",
  wumou: "锁定技，当你使用普通锦囊牌时，你选择弃置一枚“暴怒”标记或失去1点体力。",
  wuqian: "出牌阶段，你可以弃置两枚“暴怒”标记并选择一名其他角色；直到回合结束，你获得“无双”，且该角色的防具技能失效。",
  wushen: "锁定技，你的红桃手牌均视为【杀】；你使用红桃【杀】无距离限制。",
  wusheng: "你可以将一张红色牌当【杀】使用或打出。",
  wushuang: "锁定技，你使用的【杀】需连续使用两张【闪】才能抵消；与你进行【决斗】的角色每轮需连续打出两张【杀】。",
  xiangle: "锁定技，当你成为【杀】的目标后，除非使用者弃置一张基本牌，否则此【杀】对你无效。",
  xiaoji: "当你失去装备区里的一张牌后，你可以摸两张牌。",
  xingshang: "当其他角色死亡时，你可以获得其所有仍在区域内的牌。",
  xinsheng: "当你受到1点伤害后，你可以获得一张新的“化身”牌。",
  xueyi: "主公技，锁定技，你的手牌上限+X（X为其他存活的群势力角色数的两倍）。",
  yeyan: "限定技，出牌阶段，你可以对至多三名角色分配合计至多3点火焰伤害。若你分配给任一角色至少2点伤害，你须先弃置四张花色各不相同的手牌并失去3点体力。",
  yiji: "当你受到1点伤害后，你可以观看牌堆顶两张牌，并将这些牌以任意分配方式交给任意角色。",
  yinghun: "准备阶段开始时，若你已受伤，你可以选择一名其他角色并选择一项：令其摸X张牌后弃置一张牌；或令其摸一张牌后弃置X张牌（X为你已损失的体力值）。",
  yingyang: "当你的拼点牌亮出后，你可以令其点数+3或-3，调整后的点数至少为1且至多为13。",
  yingzi: "摸牌阶段，你可以多摸一张牌。",
  yongsi: "锁定技，摸牌阶段你多摸X张牌；弃牌阶段开始时你须额外弃置X张牌（X为场上存活角色的势力数）。",
  zaiqi: "摸牌阶段，若你已受伤，你可以改为亮出牌堆顶X张牌（X为你已损失的体力值+1）：每有一张红桃牌，你回复1点体力；你获得其余牌。",
  zaoxian: "觉醒技，准备阶段开始时，若你拥有至少三张“田”，你减1点体力上限，然后获得“急袭”。",
  zhiba: "主公技，其他吴势力角色的出牌阶段限一次，其可以请求与你拼点；若其没赢，你可以获得双方的拼点牌。你觉醒后可以拒绝此拼点。",
  zhiheng: "出牌阶段限一次，你可以弃置任意张牌，然后摸等量的牌。",
  zhiji: "觉醒技，准备阶段开始时，若你没有手牌，你选择回复1点体力或摸两张牌，然后减1点体力上限并获得“观星”。",
  zhijian: "出牌阶段，你可以将手牌中的一张装备牌置入一名其他角色装备区内的相应位置，然后摸一张牌。",
} satisfies Record<FullSkillRulesId, string>;

export interface SkillRuleTextDefinition {
  readonly rulesId: FullSkillRulesId;
  readonly name: string;
  readonly text: string;
}

export interface GeneralSkillRuleTextDefinition extends SkillRuleTextDefinition {
  readonly skillId: string;
  readonly category: FullGeneralSkillCategory;
}

const nameByRulesId = new Map<FullSkillRulesId, string>();
for (const general of FULL_GENERAL_CATALOG) {
  for (const skill of general.skills) {
    const existing = nameByRulesId.get(skill.rulesId);
    if (existing !== undefined && existing !== skill.name) {
      throw new Error(`共享技能名称不一致：${skill.rulesId}（${existing}/${skill.name}）`);
    }
    nameByRulesId.set(skill.rulesId, skill.name);
  }
}

/** Complete display catalog, kept in the same stable order as FULL_SKILL_RULE_IDS. */
export const FULL_SKILL_RULE_TEXTS: readonly SkillRuleTextDefinition[] = Object.freeze(
  FULL_SKILL_RULE_IDS.map((rulesId) => {
    const name = nameByRulesId.get(rulesId);
    if (name === undefined) throw new Error(`技能规则文本缺少名称：${rulesId}`);
    return Object.freeze({ rulesId, name, text: RULE_TEXT_BY_ID[rulesId] });
  }),
);

const definitionByRulesId = new Map(
  FULL_SKILL_RULE_TEXTS.map((definition) => [definition.rulesId, definition] as const),
);

/** Returns display copy only and rejects IDs outside the complete 124-rule catalog. */
export function getSkillRuleText(rulesId: string): string {
  if (!isFullSkillRulesId(rulesId)) throw new Error(`未知技能规则：${rulesId}`);
  const definition = definitionByRulesId.get(rulesId);
  if (!definition) throw new Error(`技能规则文本缺失：${rulesId}`);
  return definition.text;
}

export function getSkillRuleTextDefinition(rulesId: string): SkillRuleTextDefinition {
  if (!isFullSkillRulesId(rulesId)) throw new Error(`未知技能规则：${rulesId}`);
  const definition = definitionByRulesId.get(rulesId);
  if (!definition) throw new Error(`技能规则文本缺失：${rulesId}`);
  return definition;
}

/** Returns the general's printed skill order with each occurrence's lifecycle category preserved. */
export function getGeneralSkillRuleTexts(generalId: string): readonly GeneralSkillRuleTextDefinition[] {
  if (!isFullGeneralId(generalId)) throw new Error(`未知武将：${generalId}`);
  const general = getFullGeneralDefinition(generalId);
  return Object.freeze(
    general.skills.map((skill) =>
      Object.freeze({
        skillId: skill.id,
        rulesId: skill.rulesId,
        name: skill.name,
        category: skill.category,
        text: getSkillRuleText(skill.rulesId),
      }),
    ),
  );
}

/** Ready-to-render multi-line copy for a desktop general detail panel. */
export function combineGeneralSkillRuleText(generalId: FullGeneralId | string): string {
  return getGeneralSkillRuleTexts(generalId)
    .map((skill) => `${skill.name}：${skill.text}`)
    .join("\n");
}
