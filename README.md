# 摸鱼三国杀

面向电脑浏览器的多人文字版三国杀，采用 React、Node.js、PostgreSQL 与服务端权威规则引擎实现。支持管理员分配账号、真人或机器人开房、实时对局、断线恢复，以及标准、SP、风、火、林、山、神武将包。

示例网站：https://moyu.pdcat.cn

正式项目源码只位于 [`sanguosha-online`](./sanguosha-online)。其中包含完整的项目介绍、本地开发步骤、Docker/Nginx 生产部署说明、测试命令及发布约定：

- [项目与部署说明](./sanguosha-online/README.md)
- [原版规则差异核查](./sanguosha-online/docs/RULE_AUDIT.md)
- [部署配置](./sanguosha-online/deploy/README.md)

## 仓库与本地文件边界

- GitHub 保留：根目录说明、忽略规则及 `sanguosha-online/` 正式源码。
- 本机保留但不上传：`local/`，用于旧 Java 参考源码、历史发布包和临时交付副本。
- 构建生成且不上传：`node_modules/`、`dist/`、覆盖率、日志和 `.env`。
- 生产数据不进入仓库：PostgreSQL 数据保存在服务器 Docker volume `sanguosha_db`。

不要从 `local/` 部署。生产部署始终以 GitHub `main` 分支中的 `sanguosha-online/` 为准。

快速验证：

```bash
cd sanguosha-online
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

生产环境请使用 `sanguosha-online/docker-compose.yml`，并在服务器本地创建 `.env`；任何密钥、数据库数据、`node_modules`、构建输出或本地发布压缩包都不应提交到 GitHub。

规则实现参考 [wzk1015/sanguosha](https://github.com/wzk1015/sanguosha)。公开运营前请自行确认名称、美术及第三方素材授权。
