# 摸鱼三国杀

面向电脑浏览器的多人文字版三国杀。项目使用 TypeScript 重构原 Java 规则，采用服务端权威模型：账号、房间、牌堆、手牌、身份、行动校验、机器人和胜负判断都由服务端维护，浏览器只展示当前账号可见的信息并提交操作。

## 项目功能

- 管理员创建、停用玩家账号和重置密码，不开放公开注册。
- 真人开房、加入、准备、选将和实时多人对局。
- 房主可添加机器人补位；机器人只读取自己的私有游戏视图。
- 原版默认 160 张牌、66 名武将、124 个技能规则。
- 标准、SP、风、火、林、山、神武将包与神将势力选择。
- 服务端持久化房间和对局，支持服务重启恢复及断线重连。
- 浏览器端隐藏他人手牌和未公开身份，服务端复验每个操作。

本项目按用户要求让所有房间成员随机身份，因此房主不再固定为主公；这与原 Java 固定玩家 1 为主公的流程不同。完整核查见 [原版规则差异核查](./docs/RULE_AUDIT.md)。

## 技术架构

- `web`：React、Vite、Ant Design、Socket.IO Client
- `server`：Node.js、Express、Socket.IO、PostgreSQL
- `shared`：无 IO 的服务端权威规则核心
- `deploy`：Docker Compose 与 Nginx 示例配置

要求 Node.js 22、pnpm 11；生产部署要求 Docker、Docker Compose，使用反向代理时建议配合 Nginx 和 HTTPS。

## 本地开发

1. 启动 PostgreSQL，并创建可用数据库。
2. 复制环境变量模板：

   ```bash
   cp .env.example .env
   ```

3. 修改 `.env` 中的 `DATABASE_URL`、`SESSION_SECRET` 和初始管理员密码。
4. 安装依赖并启动：

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   pnpm dev
   ```

默认开发端口为 Web `5173`、Server `3000`。`APP_ORIGIN` 应与浏览器访问来源一致。

## Docker 生产部署

1. 在服务器安装 Docker Engine 与 Docker Compose Plugin。
2. 将项目上传到服务器，例如 `/opt/sanguosha-online`。
3. 在项目根目录创建 `.env`，至少填写：

   ```dotenv
   POSTGRES_PASSWORD=使用仅含字母数字下划线或短横线的随机密码
   SESSION_SECRET=至少32位随机字符串
   INITIAL_ADMIN_USERNAME=admin
   INITIAL_ADMIN_PASSWORD=首次登录密码至少8位
   INITIAL_ADMIN_DISPLAY_NAME=管理员
   APP_ORIGIN=https://你的域名
   APP_VERSION=1.0.0
   BUILD_SHA=可选的7至64位Git提交摘要
   ```

   不要提交 `.env`。生产环境的 `APP_ORIGIN` 必须使用 HTTPS。

4. 构建并启动：

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

5. 应用只绑定宿主机 `127.0.0.1:3100`。将 `deploy/nginx-moyu.conf` 复制为站点配置，修改 `server_name`，保留 `/socket.io/` 的 WebSocket Upgrade 头，再配置 TLS。
6. 验证部署：

   ```bash
   curl -fsS https://你的域名/healthz
   curl -fsS https://你的域名/version
   ```

数据库保存在 Docker volume `sanguosha_db`。升级前应先备份该 volume；不要使用 `docker compose down -v`，否则会删除数据库。

## 发布内容

GitHub 源码应包含本目录内的源文件、测试、Docker 配置、部署示例和文档；不要上传 `node_modules`、`dist`、`.env`、日志或本地压缩包。Release 使用项目生成的部署压缩包，解压后按上面的 Docker 步骤部署。

## 验证

```bash
pnpm check
```

该命令依次执行类型检查、测试和构建。规则迁移历史见 [迁移矩阵](./docs/RULES_MIGRATION.md)，产品边界见 [产品说明](./docs/PRODUCT_SPEC.md)。

## 许可与来源

规则实现参考 [wzk1015/sanguosha](https://github.com/wzk1015/sanguosha)，原项目与本项目均按 MIT License 使用和分发。公开运营前仍需自行确认“三国杀”名称、美术及其他第三方素材的授权；本项目默认界面不打包原仓库图片。
