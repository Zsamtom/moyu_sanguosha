# 摸鱼三国杀

面向电脑浏览器的多人文字版三国杀，采用 React、Node.js、PostgreSQL 与服务端权威规则引擎实现。支持管理员分配账号、真人或机器人开房、实时对局、断线恢复，以及标准、SP、风、火、林、山、神武将包。

正式项目源码位于 [`sanguosha-online`](./sanguosha-online)。其中包含完整的项目介绍、本地开发步骤、Docker/Nginx 生产部署说明、测试命令及发布约定：

- [项目与部署说明](./sanguosha-online/README.md)
- [原版规则差异核查](./sanguosha-online/docs/RULE_AUDIT.md)
- [部署配置](./sanguosha-online/deploy/README.md)

快速验证：

```bash
cd sanguosha-online
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

生产环境请使用 `sanguosha-online/docker-compose.yml`，并在服务器本地创建 `.env`；任何密钥、数据库数据、`node_modules`、构建输出或本地发布压缩包都不应提交到 GitHub。

规则实现参考 [wzk1015/sanguosha](https://github.com/wzk1015/sanguosha)。公开运营前请自行确认名称、美术及第三方素材授权。
