/**
 * Complete character metadata extracted from the original Java implementation.
 *
 * `skill.id` identifies one skill occurrence globally and is therefore qualified
 * by its owner. `skill.rulesId` is the reusable rules key: two characters that
 * genuinely share a rule (for example, 马术) intentionally share a `rulesId`.
 *
 * This module is deliberately self-contained so it can be integrated into the
 * authoritative engine without widening the legacy `GeneralId` unions first.
 */

export const FULL_GENERAL_PACKS = ["standard", "sp", "wind", "fire", "forest", "mountain", "god"] as const;

export type FullGeneralPack = (typeof FULL_GENERAL_PACKS)[number];
export type FullGeneralFaction = "wei" | "shu" | "wu" | "qun" | "selectable";
export type FullGeneralGender = "male" | "female";
export type FullGeneralSkillCategory =
  | "locked"
  | "optional"
  | "lord"
  | "limited"
  | "awakening"
  | "post_awakening"
  | "special";

export interface FullGeneralSkillDefinition {
  /** Globally unique, owner-qualified, stable snake_case identifier. */
  readonly id: string;
  /** Stable dispatch key shared by equivalent skill implementations. */
  readonly rulesId: FullSkillRulesId;
  readonly name: string;
  readonly category: FullGeneralSkillCategory;
  /** Incorrect or implementation-only annotation name in the Java source. */
  readonly sourceAlias?: string;
  readonly notes?: string;
}

export interface FullGeneralDefinition {
  readonly id: FullGeneralId;
  readonly name: string;
  readonly pack: FullGeneralPack;
  /** `selectable` means a god chooses Wei/Shu/Wu/Qun at game start. */
  readonly faction: FullGeneralFaction;
  readonly gender: FullGeneralGender;
  readonly maxHp: number;
  readonly skills: readonly FullGeneralSkillDefinition[];
  readonly sourceFile: string;
  readonly notes?: string;
}

interface SkillInput extends Omit<FullGeneralSkillDefinition, "id"> {}
interface GeneralInput extends Omit<FullGeneralDefinition, "skills"> {
  readonly skills: readonly SkillInput[];
}

const s = (
  rulesId: FullSkillRulesId,
  name: string,
  category: FullGeneralSkillCategory,
  extra: Pick<SkillInput, "sourceAlias" | "notes"> = {},
): SkillInput => Object.freeze({ rulesId, name, category, ...extra });

const general = (input: GeneralInput): FullGeneralDefinition =>
  Object.freeze({
    ...input,
    skills: Object.freeze(
      input.skills.map((skill) =>
        Object.freeze({
          ...skill,
          id: `${input.id}_${skill.rulesId}`,
        }),
      ),
    ),
  });

const GOD_FACTION_NOTE = "God.java stores null initially; the player chooses Wei, Shu, Wu, or Qun at game start.";

/** 25 standard + 1 SP + 8 each from Wind/Fire/Forest/Mountain/God. */
export const FULL_GENERAL_CATALOG: readonly FullGeneralDefinition[] = Object.freeze([
  // Standard — Wei
  general({ id: "cao_cao", name: "曹操", pack: "standard", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/wei/CaoCao.java", skills: [s("jianxiong", "奸雄", "optional"), s("hujia", "护驾", "lord")] }),
  general({ id: "guo_jia", name: "郭嘉", pack: "standard", faction: "wei", gender: "male", maxHp: 3, sourceFile: "people/wei/GuoJia.java", skills: [s("tiandu", "天妒", "optional"), s("yiji", "遗计", "optional")] }),
  general({ id: "si_ma_yi", name: "司马懿", pack: "standard", faction: "wei", gender: "male", maxHp: 3, sourceFile: "people/wei/SiMaYi.java", skills: [s("guicai", "鬼才", "optional"), s("fankui", "反馈", "optional")] }),
  general({ id: "xia_hou_dun", name: "夏侯惇", pack: "standard", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/wei/XiaHouDun.java", skills: [s("ganglie", "刚烈", "optional")] }),
  general({ id: "xu_chu", name: "许褚", pack: "standard", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/wei/XuChu.java", skills: [s("luoyi", "裸衣", "optional")] }),
  general({ id: "zhang_liao", name: "张辽", pack: "standard", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/wei/ZhangLiao.java", skills: [s("tuxi", "突袭", "optional")] }),
  general({ id: "zhen_ji", name: "甄姬", pack: "standard", faction: "wei", gender: "female", maxHp: 3, sourceFile: "people/wei/ZhenJi.java", skills: [s("luoshen", "洛神", "optional"), s("qingguo", "倾国", "optional")] }),

  // Standard — Shu
  general({ id: "guan_yu", name: "关羽", pack: "standard", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/shu/GuanYu.java", skills: [s("wusheng", "武圣", "optional")] }),
  general({ id: "huang_yue_ying", name: "黄月英", pack: "standard", faction: "shu", gender: "female", maxHp: 3, sourceFile: "people/shu/HuangYueYing.java", skills: [s("jizhi", "集智", "optional", { sourceAlias: "急智", notes: "Java annotation/launcher says 急智 while skillsDescription says 集智." }), s("qicai", "奇才", "locked")] }),
  general({ id: "liu_bei", name: "刘备", pack: "standard", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/shu/LiuBei.java", skills: [s("rende", "仁德", "optional"), s("jijiang", "激将", "lord")] }),
  general({ id: "ma_chao", name: "马超", pack: "standard", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/shu/MaChao.java", skills: [s("mashu", "马术", "locked"), s("tieqi", "铁骑", "optional")] }),
  general({ id: "zhang_fei", name: "张飞", pack: "standard", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/shu/ZhangFei.java", skills: [s("paoxiao", "咆哮", "locked")] }),
  general({ id: "zhao_yun", name: "赵云", pack: "standard", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/shu/ZhaoYun.java", skills: [s("longdan", "龙胆", "optional")] }),
  general({ id: "zhu_ge_liang", name: "诸葛亮", pack: "standard", faction: "shu", gender: "male", maxHp: 3, sourceFile: "people/shu/ZhuGeLiang.java", skills: [s("guanxing", "观星", "optional"), s("kongcheng", "空城", "locked")] }),

  // Standard — Wu
  general({ id: "da_qiao", name: "大乔", pack: "standard", faction: "wu", gender: "female", maxHp: 3, sourceFile: "people/wu/DaQiao.java", skills: [s("guose", "国色", "optional"), s("liuli", "流离", "optional")] }),
  general({ id: "gan_ning", name: "甘宁", pack: "standard", faction: "wu", gender: "male", maxHp: 4, sourceFile: "people/wu/GanNing.java", skills: [s("qixi", "奇袭", "optional")] }),
  general({ id: "huang_gai", name: "黄盖", pack: "standard", faction: "wu", gender: "male", maxHp: 4, sourceFile: "people/wu/HuangGai.java", skills: [s("kurou", "苦肉", "optional")] }),
  general({ id: "lu_xun", name: "陆逊", pack: "standard", faction: "wu", gender: "male", maxHp: 3, sourceFile: "people/wu/LuXun.java", skills: [s("qianxun", "谦逊", "locked"), s("lianying", "连营", "optional")] }),
  general({ id: "lv_meng", name: "吕蒙", pack: "standard", faction: "wu", gender: "male", maxHp: 4, sourceFile: "people/wu/LvMeng.java", skills: [s("keji", "克己", "optional")] }),
  general({ id: "sun_quan", name: "孙权", pack: "standard", faction: "wu", gender: "male", maxHp: 4, sourceFile: "people/wu/SunQuan.java", skills: [s("zhiheng", "制衡", "optional"), s("jiuyuan", "救援", "lord", { notes: "The source marks this as both a lord skill and a mandatory effect." })] }),
  general({ id: "sun_shang_xiang", name: "孙尚香", pack: "standard", faction: "wu", gender: "female", maxHp: 3, sourceFile: "people/wu/SunShangXiang.java", skills: [s("xiaoji", "枭姬", "optional"), s("jieyin", "结姻", "optional")] }),
  general({ id: "zhou_yu", name: "周瑜", pack: "standard", faction: "wu", gender: "male", maxHp: 3, sourceFile: "people/wu/ZhouYu.java", skills: [s("yingzi", "英姿", "optional"), s("fanjian", "反间", "optional")] }),

  // Standard — Qun
  general({ id: "diao_chan", name: "貂蝉", pack: "standard", faction: "qun", gender: "female", maxHp: 3, sourceFile: "people/qun/DiaoChan.java", skills: [s("biyue", "闭月", "optional"), s("lijian", "离间", "optional")] }),
  general({ id: "hua_tuo", name: "华佗", pack: "standard", faction: "qun", gender: "male", maxHp: 3, sourceFile: "people/qun/HuaTuo.java", skills: [s("jijiu", "急救", "optional"), s("qingnang", "青囊", "optional")] }),
  general({ id: "lv_bu", name: "吕布", pack: "standard", faction: "qun", gender: "male", maxHp: 4, sourceFile: "people/qun/LvBu.java", skills: [s("wushuang", "无双", "locked")] }),

  // SP
  general({ id: "yuan_shu", name: "袁术", pack: "sp", faction: "qun", gender: "male", maxHp: 4, sourceFile: "people/qun/YuanShu.java", skills: [s("yongsi", "庸肆", "locked"), s("weidi", "伪帝", "locked")], notes: "SpecialSkill methods for individual lord skills are implementation adapters for 伪帝, not additional printed skills." }),

  // Wind
  general({ id: "cao_ren", name: "曹仁", pack: "wind", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/wind/CaoRen.java", skills: [s("jushou", "据守", "optional")], notes: "The Java description omits the 据守 label but the method annotation supplies it." }),
  general({ id: "huang_zhong", name: "黄忠", pack: "wind", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/wind/HuangZhong.java", skills: [s("liegong", "烈弓", "optional")] }),
  general({ id: "wei_yan", name: "魏延", pack: "wind", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/wind/WeiYan.java", skills: [s("kuanggu", "狂骨", "locked")] }),
  general({ id: "xia_hou_yuan", name: "夏侯渊", pack: "wind", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/wind/XiaHouYuan.java", skills: [s("shensu", "神速", "optional")] }),
  general({ id: "xiao_qiao", name: "小乔", pack: "wind", faction: "qun", gender: "female", maxHp: 3, sourceFile: "people/wind/XiaoQiao.java", skills: [s("tianxiang", "天香", "optional"), s("hongyan", "红颜", "locked")], notes: "The original constructor and migration matrix use Qun; common official editions list Xiao Qiao as Wu." }),
  general({ id: "yu_ji", name: "于吉", pack: "wind", faction: "qun", gender: "male", maxHp: 3, sourceFile: "people/wind/YuJi.java", skills: [s("guhuo", "蛊惑", "optional")] }),
  general({ id: "zhang_jiao", name: "张角", pack: "wind", faction: "qun", gender: "male", maxHp: 3, sourceFile: "people/wind/ZhangJiao.java", skills: [s("leiji", "雷击", "optional"), s("guidao", "鬼道", "optional"), s("huangtian", "黄天", "lord")] }),
  general({ id: "zhou_tai", name: "周泰", pack: "wind", faction: "wu", gender: "male", maxHp: 4, sourceFile: "people/wind/ZhouTai.java", skills: [s("buqu", "不屈", "optional")] }),

  // Fire
  general({ id: "dian_wei", name: "典韦", pack: "fire", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/fire/DianWei.java", skills: [s("qiangxi", "强袭", "optional")] }),
  general({ id: "pang_de", name: "庞德", pack: "fire", faction: "qun", gender: "male", maxHp: 4, sourceFile: "people/fire/PangDe.java", skills: [s("mashu", "马术", "locked"), s("mengjin", "猛进", "optional")] }),
  general({ id: "pang_tong", name: "庞统", pack: "fire", faction: "shu", gender: "male", maxHp: 3, sourceFile: "people/fire/PangTong.java", skills: [s("lianhuan", "连环", "optional"), s("niepan", "涅槃", "limited")] }),
  general({ id: "tai_shi_ci", name: "太史慈", pack: "fire", faction: "wu", gender: "male", maxHp: 4, sourceFile: "people/fire/TaiShiCi.java", skills: [s("tianyi", "天义", "optional")] }),
  general({ id: "wo_long", name: "卧龙诸葛亮", pack: "fire", faction: "shu", gender: "male", maxHp: 3, sourceFile: "people/fire/WoLong.java", skills: [s("bazhen", "八阵", "locked"), s("huoji", "火计", "optional"), s("kanpo", "看破", "optional")] }),
  general({ id: "xun_yu", name: "荀彧", pack: "fire", faction: "wei", gender: "male", maxHp: 3, sourceFile: "people/fire/XunYu.java", skills: [s("quhu", "驱虎", "optional"), s("jieming", "节命", "optional")] }),
  general({ id: "yan_liang_wen_chou", name: "颜良文丑", pack: "fire", faction: "qun", gender: "male", maxHp: 4, sourceFile: "people/fire/YanLiangWenChou.java", skills: [s("shuangxiong", "双雄", "optional")] }),
  general({ id: "yuan_shao", name: "袁绍", pack: "fire", faction: "qun", gender: "male", maxHp: 4, sourceFile: "people/fire/YuanShao.java", skills: [s("luanji", "乱击", "optional"), s("xueyi", "血裔", "lord", { notes: "The source marks 血裔 as both a lord skill and a mandatory effect." })] }),

  // Forest
  general({ id: "cao_pi", name: "曹丕", pack: "forest", faction: "wei", gender: "male", maxHp: 3, sourceFile: "people/forest/CaoPi.java", skills: [s("xingshang", "行殇", "optional"), s("fangzhu", "放逐", "optional"), s("songwei", "颂威", "lord")] }),
  general({ id: "dong_zhuo", name: "董卓", pack: "forest", faction: "qun", gender: "male", maxHp: 8, sourceFile: "people/forest/DongZhuo.java", skills: [s("jiuchi", "酒池", "optional"), s("roulin", "肉林", "locked"), s("benghuai", "崩坏", "locked"), s("baonue", "暴虐", "lord")] }),
  general({ id: "jia_xu", name: "贾诩", pack: "forest", faction: "qun", gender: "male", maxHp: 3, sourceFile: "people/forest/JiaXu.java", skills: [s("wansha", "完杀", "locked"), s("luanwu", "乱武", "limited"), s("weimu", "帷幕", "locked")] }),
  general({ id: "lu_su", name: "鲁肃", pack: "forest", faction: "wu", gender: "male", maxHp: 3, sourceFile: "people/forest/LuSu.java", skills: [s("haoshi", "好施", "optional"), s("dimeng", "缔盟", "optional")] }),
  general({ id: "meng_huo", name: "孟获", pack: "forest", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/forest/MengHuo.java", skills: [s("huoshou", "祸首", "locked"), s("zaiqi", "再起", "optional")] }),
  general({ id: "sun_jian", name: "孙坚", pack: "forest", faction: "wu", gender: "male", maxHp: 4, sourceFile: "people/forest/SunJian.java", skills: [s("yinghun", "英魂", "optional")] }),
  general({ id: "xu_huang", name: "徐晃", pack: "forest", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/forest/XuHuang.java", skills: [s("duanliang", "断粮", "optional")] }),
  general({ id: "zhu_rong", name: "祝融", pack: "forest", faction: "shu", gender: "female", maxHp: 4, sourceFile: "people/forest/ZhuRong.java", skills: [s("juxiang", "巨象", "locked"), s("lieren", "烈刃", "optional")] }),

  // Mountain
  general({ id: "cai_wen_ji", name: "蔡文姬", pack: "mountain", faction: "qun", gender: "female", maxHp: 3, sourceFile: "people/mountain/CaiWenJi.java", skills: [s("beige", "悲歌", "optional"), s("duanchang", "断肠", "locked", { notes: "The Java description explicitly labels the original implementation half implemented." })] }),
  general({ id: "deng_ai", name: "邓艾", pack: "mountain", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/mountain/DengAi.java", skills: [s("tuntian", "屯田", "optional"), s("zaoxian", "凿险", "awakening"), s("jixi", "急袭", "post_awakening")] }),
  general({ id: "jiang_wei", name: "姜维", pack: "mountain", faction: "shu", gender: "male", maxHp: 4, sourceFile: "people/mountain/JiangWei.java", skills: [s("tiaoxin", "挑衅", "optional"), s("zhiji", "志继", "awakening"), s("guanxing", "观星", "post_awakening")] }),
  general({ id: "liu_chan", name: "刘禅", pack: "mountain", faction: "shu", gender: "male", maxHp: 3, sourceFile: "people/mountain/LiuChan.java", skills: [s("xiangle", "享乐", "locked"), s("fangquan", "放权", "optional"), s("ruoyu", "若愚", "awakening", { notes: "若愚 is both a lord skill and an awakening skill; awakening is the primary lifecycle category." }), s("jijiang", "激将", "post_awakening", { notes: "Granted by 若愚 and only usable while Liu Chan is lord." })] }),
  general({ id: "sun_ce", name: "孙策", pack: "mountain", faction: "wu", gender: "male", maxHp: 4, sourceFile: "people/mountain/SunCe.java", skills: [s("jiang", "激昂", "optional"), s("yingyang", "鹰扬", "optional", { notes: "Present as a Java @Skill annotation and implemented for pindian, but omitted from skillsDescription." }), s("hunzi", "魂姿", "awakening"), s("zhiba", "制霸", "lord"), s("yingzi", "英姿", "post_awakening"), s("yinghun", "英魂", "post_awakening")] }),
  general({ id: "zhang_he", name: "张郃", pack: "mountain", faction: "wei", gender: "male", maxHp: 4, sourceFile: "people/mountain/ZhangHe.java", skills: [s("qiaobian", "巧变", "optional")] }),
  general({ id: "zhang_zhao_zhang_hong", name: "张昭张纮", pack: "mountain", faction: "wu", gender: "male", maxHp: 3, sourceFile: "people/mountain/ZhangZhaoZhangHong.java", skills: [s("zhijian", "直谏", "optional"), s("guzheng", "固政", "optional")] }),
  general({ id: "zuo_ci", name: "左慈", pack: "mountain", faction: "qun", gender: "male", maxHp: 3, sourceFile: "people/mountain/ZuoCi.java", skills: [s("huashen", "化身", "special", { notes: "Implemented by default methods on HuaShen rather than annotations in ZuoCi.java." }), s("xinsheng", "新生", "optional", { notes: "Implemented by default methods on HuaShen rather than annotations in ZuoCi.java." })] }),

  // God — faction is selected at game start by God.initialize().
  general({ id: "shen_cao_cao", name: "神曹操", pack: "god", faction: "selectable", gender: "male", maxHp: 3, sourceFile: "people/god/ShenCaoCao.java", skills: [s("guixin", "归心", "optional"), s("feiying", "飞影", "locked")], notes: GOD_FACTION_NOTE }),
  general({ id: "shen_guan_yu", name: "神关羽", pack: "god", faction: "selectable", gender: "male", maxHp: 5, sourceFile: "people/god/ShenGuanYu.java", skills: [s("wushen", "武神", "locked", { sourceAlias: "武魂", notes: "The addCard method is annotated 武魂, but implements the 武神 rule described by skillsDescription." }), s("wuhun", "武魂", "locked", { sourceAlias: "梦魇", notes: "The death method is annotated 梦魇; together with gotHurt it implements the printed 武魂 rule." })], notes: GOD_FACTION_NOTE }),
  general({ id: "shen_lv_bu", name: "神吕布", pack: "god", faction: "selectable", gender: "male", maxHp: 5, sourceFile: "people/god/ShenLvBu.java", skills: [s("kuangbao", "狂暴", "locked", { sourceAlias: "暴怒", notes: "The Java annotation says 暴怒 while skillsDescription calls the skill 狂暴." }), s("wumou", "无谋", "locked"), s("wuqian", "无前", "optional"), s("wushuang", "无双", "special", { notes: "Temporarily granted by 无前 rather than active as an intrinsic start-of-game skill." }), s("shenfen", "神愤", "optional")], notes: GOD_FACTION_NOTE }),
  general({ id: "shen_lv_meng", name: "神吕蒙", pack: "god", faction: "selectable", gender: "male", maxHp: 3, sourceFile: "people/god/ShenLvMeng.java", skills: [s("shelie", "涉猎", "optional"), s("gongxin", "攻心", "optional")], notes: GOD_FACTION_NOTE }),
  general({ id: "shen_si_ma_yi", name: "神司马懿", pack: "god", faction: "selectable", gender: "male", maxHp: 4, sourceFile: "people/god/ShenSiMaYi.java", skills: [s("renjie", "忍戒", "locked"), s("baiyin", "拜印", "awakening"), s("jilue", "极略", "post_awakening"), s("guicai", "鬼才", "post_awakening"), s("fangzhu", "放逐", "post_awakening"), s("jizhi", "集智", "post_awakening", { sourceAlias: "急智", notes: "The @AfterWakeSkill annotation/launcher says 急智 while skillsDescription says 集智." }), s("zhiheng", "制衡", "post_awakening"), s("wansha", "完杀", "post_awakening"), s("lianpo", "连破", "optional")], notes: GOD_FACTION_NOTE }),
  general({ id: "shen_zhao_yun", name: "神赵云", pack: "god", faction: "selectable", gender: "male", maxHp: 2, sourceFile: "people/god/ShenZhaoYun.java", skills: [s("juejing", "绝境", "locked"), s("longhun", "龙魂", "optional")], notes: GOD_FACTION_NOTE }),
  general({ id: "shen_zhou_yu", name: "神周瑜", pack: "god", faction: "selectable", gender: "male", maxHp: 4, sourceFile: "people/god/ShenZhouYu.java", skills: [s("qinyin", "琴音", "optional"), s("yeyan", "业炎", "limited")], notes: GOD_FACTION_NOTE }),
  general({ id: "shen_zhu_ge_liang", name: "神诸葛亮", pack: "god", faction: "selectable", gender: "male", maxHp: 3, sourceFile: "people/god/ShenZhuGeLiang.java", skills: [s("qixing", "七星", "optional"), s("kuangfeng", "狂风", "optional"), s("dawu", "大雾", "optional")], notes: GOD_FACTION_NOTE }),
]);

export function getFullGeneralDefinition(id: FullGeneralId): FullGeneralDefinition {
  const definition = FULL_GENERAL_CATALOG.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`未知武将：${id}`);
  return definition;
}

export function getFullGeneralSkillDefinition(id: string): FullGeneralSkillDefinition {
  for (const generalDefinition of FULL_GENERAL_CATALOG) {
    const skill = generalDefinition.skills.find((candidate) => candidate.id === id);
    if (skill) return skill;
  }
  throw new Error(`未知武将技能：${id}`);
}
import type { FullGeneralId } from "./full-general-ids.js";
import type { FullSkillRulesId } from "./full-skill-ids.js";
