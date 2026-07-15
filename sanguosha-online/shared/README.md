# @sanguosha/shared

无 IO、可序列化的文字版三国杀规则核心。每个房间保存一份独立的
`GameSession`；浏览器只能接收 `getGameView` 生成的脱敏视图。

## 服务端接口

```ts
import {
  applyAction,
  createGame,
  forfeitPlayer,
  getGameView,
  type GameAction,
  type GameSession,
} from "@sanguosha/shared";

let session: GameSession = createGame({
  playerIds: ["user-1", "user-2"],
  seed: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
});

const action: GameAction = {
  type: "end_play",
  playerId: session.currentPlayerId,
};
session = applyAction(session, action);

// A member leaving a running room forfeits and ends that game.
session = forfeitPlayer(session, "user-2");

const privateView = getGameView(session, "user-1");
const spectatorView = getGameView(session, null);
```

`applyAction` 不修改传入的会话，会返回一份新会话；非法操作抛出带有
`code` 的 `GameRuleError`。`GameSession` 包含所有手牌和身份，只能保存在
可信服务端。所有会话字段均可通过 JSON 序列化。

## 动作

```ts
type GameAction =
  | { type: "play_card"; playerId: string; cardId: string; targetId?: string; targetIds?: string[] }
  | { type: "respond"; playerId: string; cardId?: string | null }
  | { type: "activate_armor"; playerId: string; activate: boolean }
  | { type: "end_play"; playerId: string }
  | { type: "discard"; playerId: string; cardIds: string[] }
  | { type: "choose_zone_card"; playerId: string; token: string }
  | { type: "choose_hand_card"; playerId: string; cardId?: string | null }
  | { type: "choose_amazing_grace_card"; playerId: string; cardId: string }
  | { type: "use_skill"; playerId: string; skillId: string; cardIds?: string[]; targetId?: string }
  | { type: "resolve_skill"; playerId: string; skillId: string; activate: boolean };
```

- `play_card`：普通/火/雷杀和决斗必须给出一名其他存活玩家；桃与酒可省略
  `targetId` 或传自己；无中生有同样自动以自己为目标；南蛮入侵、
  万箭齐发和桃园结义不传目标。
- `respond`：按 Prompt 给出杀族、闪、桃/酒或无懈可击的牌 ID；使用
  `null`/省略牌 ID 表示放弃本次响应。
- `activate_armor`：收到八卦阵提示时选择是否发动；判定失败或不发动后仍可正常打出闪。
- `end_play`：结束出牌；手牌超过当前体力时进入弃牌阶段。
- `discard`：必须一次提交视图提示的准确弃牌数量。

前端应以 `GameView.prompt` 为准展示当前合法操作。Prompt 分为
`play`、`skill_choice`、`armor`、`nullification`、`respond`、`dying`、`discard`、`waiting` 和 `finished`。出牌提示中的
`targetMode` 为 `none`、`self` 或 `single-other`；响应提示通过
`context`、`responseKind`、`allowedCardIds`、`requiredCount` 和 `respondedCount`
完整描述当前合法响应；无双的双闪/双杀按逐张 Prompt 推进并可在任一张后恢复。

## 当前规则批次

- 支持 2–10 人身份分配，每局随机一名主公并从主公开始。
- 每人四张起始手牌；服务端从标准包 25 名武将与 SP 袁术组成的默认 26 人池中随机分配不同武将并采用其基础体力，五人及以上时主公体力上限 +1；回合开始摸两张。
- 标准牌含花色、点数、类别和中文名称。当前已按原 Java `CardsHeap`
  完整录入 41 种、160 张默认牌，包括全部基本牌、普通/延时锦囊、十一种武器、四种防具和七匹坐骑。
- 每个出牌阶段限一张杀；三种杀均由闪响应。酒每阶段限一张，使本回合
  下一张杀伤害 +1；未使用的酒加值随回合结束清零。
- 无中生有摸两张；决斗双方轮流出杀直到一方放弃；南蛮入侵与万箭齐发
  从使用者下家开始按座次逐人请求杀或闪；桃园结义令所有受伤存活玩家
  各回复一点体力。
- 手牌上限等于当前体力，牌堆用尽后会洗入弃牌堆。
- 杀按存活座次环计算默认距离 1；阵亡角色不再占据距离。
- 体力降到 0 以下后按座次逐人请求桃，濒死者本人可以使用桃或酒；救援结束后恢复原卡牌结算。
- 实现阵亡、击杀反贼摸三张、主公误杀忠臣弃全部手牌及身份胜负。
- 已实现全部默认武器、防具和坐骑；复杂武器使用同一可持久化响应栈，支持方天多目标与丈八主动/响应虚拟杀。
- 已实现无懈可击的逐目标、可反复抵消响应链；只有实际持有者收到私有操作提示，机器人和快照恢复使用同一协议。
- 已实现过河拆桥、顺手牵羊及跨角色手牌/装备/判定区选择；暗手牌只以匿名选项投影。
- 已接入默认池全部 26 名武将的 42 个技能行为：原有 32 个技能，以及奸雄、天妒、遗计、鬼才、反馈、刚烈、突袭、观星、铁骑、流离。技能成本、目标、响应与可选发动均由服务端 Prompt 驱动并可持久化。护驾和激将按存活座次依次请求同势力角色打出实体牌，保存唯一 Prompt、候选游标与原响应续体；激将主动杀的来源、次数、距离及无双均归请求者。伪帝从当前存活主公动态取得仍有效的主公技，并随身份、死亡和技能获得/失去即时刷新；庸肆按存活普通势力数摸牌，并把额外弃牌与手牌上限弃牌保存为两个可恢复阶段。反间先持久化目标的花色声明 Prompt，合法且 ID 匹配的选择才消耗房间 RNG，再公开随机转移牌并按周瑜为来源结算伤害；离间保存有序男性目标并直接进入决斗响应链，不开放无懈可击，决斗结束或死亡结算后恢复貂蝉的原出牌阶段。所有现有手牌和装备离区路径统一产生 `afterMove` 触发，连营与枭姬会暂存同一动作生成的后续响应并在选择结束后恢复；集智在普通锦囊完成合法性校验后、实体牌移动前生成带唯一 ID 的选择续体；洛神每次黑色判定后的继续选择带独立循环序号。判定牌现在以处理区实体和可序列化 `JudgmentFrame` 结算，鬼才替换最终实体判定牌，天妒取得最终生效牌，并覆盖延时锦囊、洛神、刚烈、铁骑和八卦阵。遗计按每点伤害独立观看牌堆顶两张并精确分配；流离先于铁骑处理，按弃牌后的攻击范围校验重定向目标。所有新窗口均带唯一 Prompt ID，断线恢复或重放不会重复移动实体牌。
- 当前仍不含武将候选选择、风火林山神等扩展包技能行为及覆盖全部事件类型的统一技能注册系统；扩展 40 将仍为元数据状态。

生产服务端必须为每个新房间传入 32 字节安全随机数的十六进制 `seed`。
引擎使用纯 TypeScript ChaCha20 流洗身份、初始牌堆及重洗的弃牌堆；密钥与
计数器只存在服务端 `GameSession` 中，不会进入 `GameView`。
