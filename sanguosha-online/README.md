# 墨羽三国杀 Online

基于 TypeScript 重构的多人文字版三国杀。项目采用服务端权威模型：账号、房间、牌堆、手牌、身份、行动校验和胜负判断都由服务端维护，浏览器只展示属于当前账号的视图并提交操作。

支持纯真人房间，也支持单人创建房间后由房主添加机器人。机器人自动准备，并仅依据自己的私有游戏视图执行服务端已确认合法的出牌、响应、濒死救援和弃牌动作。

首个成品的账号、房间、身份局、断线处理和规则范围以 [产品与规则基线](./docs/PRODUCT_SPEC.md) 为准；迁移进度与旧 Java 实现差异记录在 [规则迁移矩阵](./docs/RULES_MIGRATION.md)。

## 当前架构

- `web`：React、Vite、Ant Design、Socket.IO Client
- `server`：Node.js、Express、Socket.IO、PostgreSQL
- `shared`：无 IO 的纯 TypeScript 游戏规则核心
- `deploy`：Ubuntu、Docker Compose、Nginx 部署配置

## 账号模式

应用没有公开注册入口。首次启动会依据环境变量创建管理员，管理员登录后可以创建玩家账号、重置密码以及启用或停用账号。

## 本地启动

1. 复制 `.env.example` 为 `.env`，修改其中的管理员密码和会话密钥。
2. 启动 PostgreSQL，并使 `DATABASE_URL` 指向该数据库。
3. 安装依赖并启动：

   ```bash
   pnpm install
   pnpm dev
   ```

生产环境使用根目录的 `docker-compose.yml`，应用默认仅监听宿主机 `127.0.0.1:3100`，由 Nginx 对外提供访问。

部署时可通过非敏感环境变量 `APP_VERSION` 和 `BUILD_SHA` 标记构建。`GET /healthz` 检查应用及数据库状态，`GET /version` 返回当前发布标识；这两个端点均禁止缓存。

## 安全约束

- 密码仅以哈希形式保存。
- 登录会话使用 HttpOnly Cookie；没有开放注册。
- 每个房间持有独立游戏实例。
- 房间与对局快照写入 PostgreSQL；服务重启后可恢复并提供重连宽限期。
- 私有手牌与身份由服务端按查看者过滤。
- 机器人不对应可登录账号，不读取其他玩家手牌或服务端牌堆。
- 所有卡牌行动均由服务端再次校验。

## 来源与许可

规则实现参考了 [wzk1015/sanguosha](https://github.com/wzk1015/sanguosha)。原项目与本重构项目均按 MIT License 使用和分发。部署公开服务前仍需自行确认名称、美术与其他第三方素材的授权；本项目默认界面不打包原仓库图片。
