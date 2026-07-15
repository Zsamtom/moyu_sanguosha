在分析本项目既有对话与代码的基础上，将现有三国杀项目重构为可通过网页运行和部署的多人文字版三国杀：采用管理员创建、分配和管理账号的封闭分发模式；提供基于开源 UI 组件的前端网页；支持用户创建/加入房间、多人实时游戏，并允许单人添加机器人补位完成游戏；以可测试、可部署、规则与状态由服务端权威裁决的成品为最终交付。
已完成当前步骤并暂停。生产服务器未改动、未部署。

## 本步完成

- 非致死及致死伤害均接入权威 `DamageFlow`。
- 致死伤害可在濒死阶段持久化，救援或死亡后准确恢复原来的杀、群攻、铁索、闪电、回合续接。
- 新增严格续接编解码，拒绝未知字段、非法递归、内部光标嵌套及篡改。
- 服务端可恢复合法的 active 致死快照，并校验 frame/damage/dying ID、来源、目标、HP、调用续接及玩家引用。
- 支持负 HP 的多点致死快照。
- 救援、死亡奖惩、胜负结束、火焰连环均保证结算一次。
- 修复濒死期间玩家离席、离席直接结束游戏、after-move 暂停濒死时遗失光标的问题。
- 浏览器投影不再泄露内部伤害光标和业务续接。
- `DyingStack`、`DeathStack` 已加入持久化状态，但目前只允许空栈，等待下一阶段实机接入。

主要位置：

- [game.ts](<C:/Users/zzx/Documents/New project/sanguosha-online/shared/src/game.ts:602>)
- [game-damage-continuation.ts](<C:/Users/zzx/Documents/New project/sanguosha-online/shared/src/engine/game-damage-continuation.ts:14>)
- [room-persistence.ts](<C:/Users/zzx/Documents/New project/sanguosha-online/server/src/room-persistence.ts:229>)
- [live-damage-dying-flow.test.ts](<C:/Users/zzx/Documents/New project/sanguosha-online/shared/test/live-damage-dying-flow.test.ts:135>)
- [live-damage-persistence.test.ts](<C:/Users/zzx/Documents/New project/sanguosha-online/server/src/live-damage-persistence.test.ts:1>)

验证结果：

- Shared：42 个测试文件、1091 项测试全部通过，包含 100 局五人机器人模拟。
- Server：6 个测试文件、61 项测试全部通过。
- Web：54 项测试全部通过。
- Shared build/typecheck、Server typecheck、Web typecheck 全部通过。

## 当前整体状态

| 范围 | 状态 |
|---|---|
| 管理员分配账号、房间、机器人、PC 网页、部署基线 | 已完成 |
| 160 张牌及基本牌/锦囊/装备规则 | 已接入 |
| 66 武将、124 技能文本及原项目冲突决策 | 目录完成 |
| 标准包与 SP：26 武将、42 技能 | 已实机接入 |
| 风包 | 纯运行时与雷击规划已完成，尚未全部接入游戏 |
| 火包 | 纯运行时完成，尚未实机接入 |
| 林包 | 纯运行时完成，尚未实机接入 |
| 山包 | 纯运行时完成，尚未实机接入 |
| 神包 | 纯运行时完成，尚未实机接入 |

## 剩余项目

1. 将 `DyingStack`、`DeathStack` 正式接入游戏，取代当前遗留的 `killPlayer` 死亡、弃牌和奖惩流程。
2. 接入不屈、涅槃等特殊存活规则；不屈底层证明分支已有，但尚未成为实机提示。
3. 把奸雄、遗计、反馈、刚烈及麒麟弓等伤后机会迁入统一 DamageFlow 窗口。
4. 将酒、裸衣、古锭刀、藤甲、白银狮子等伤害修正完整纳入 DamageInstance 审计，而不是预先计算。
5. 支持伤害窗口中的嵌套伤害、技能暂停及恢复。
6. 依次完成风、火、林、山、神扩展包全部武将技能的实机接入。
7. 开放完整 66 武将选择、扩展包/规则配置。
8. 为所有新增技能补齐机器人决策。
9. 为全部技能提示补齐桌面网页交互；继续明确不考虑移动端。
10. 处理长期对局中 DamageFlow 已完成 ID 账本增长及更稳定的伤害原因元数据。
11. 执行全技能交互矩阵、长局恢复、安全、并发、负载和真实浏览器验收。
12. 全部完成后再进行唯一一次生产部署；当前 `moyu.pdcat.cn` 未被本轮修改。

工作区目前包含大量未提交改动，不应假定 Git 工作树干净。

## 新对话交接文本

```text
继续开发 C:\Users\zzx\Documents\New project\sanguosha-online。

原项目：https://github.com/wzk1015/sanguosha

最终目标：仅面向电脑网页、管理员分配账号、服务器权威、可多人开房，也可单人加机器人，完整实现文字版三国杀全部 66 武将、扩展包、技能和规则。优先游戏完整性，房间与多人已有基线。中间版本不要部署，全部完成后只做一次生产部署。

当前已完成：
1. 管理员账号、房间、机器人、PC 网页及部署基线。
2. 160 张牌、66 武将目录、124 技能文本及原项目冲突决策。
3. 标准/SP 26 武将、42 技能实机接入。
4. DamageFlow 非致死和致死/濒死主链、严格续接 codec、快照恢复、防篡改、胜负/离席/连环恢复。
5. DyingStack、DeathStack 已持久化但目前只允许空栈。
6. 最终验证：shared 1091/1091，server 61/61，web 54/54；类型检查和 shared build 均通过。
7. 生产环境尚未改动。

下一步优先：
将 DyingStack/DeathStack、不屈/涅槃和标准伤后技能完全接入 live DamageFlow，移除遗留 killPlayer 死亡路径；完成后开始风包全部技能实机接入。

注意：
- 工作树已有大量目标内未提交改动，必须保留。
- 使用 apply_patch 编辑。
- 不做移动端。
- 不部署中间版本。
- 不在输出中回显服务器密码。
```
