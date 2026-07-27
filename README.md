# 墨鱼

面向电脑浏览器的私人游戏与功能工作区，采用 React、Node.js、PostgreSQL 与服务端权威规则引擎实现。当前“游戏”包含三国杀、固定 6 人 3V3 的山东够级、经典 3 人斗地主、璀璨宝石、璀璨宝石宝可梦和数字炸弹；“功能”包含支持本地 TXT、中文编码、章节识别与技术文档模式的小说阅读器。

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

规则实现参考 [wzk1015/sanguosha](https://github.com/wzk1015/sanguosha)、[alun-430/gouji](https://github.com/alun-430/gouji)、[jrbarronumd/Splendor](https://github.com/jrbarronumd/Splendor) 与 [xiaoruanyo/splendor-pokemon](https://github.com/xiaoruanyo/splendor-pokemon)。公开运营前请自行确认名称、美术及第三方素材授权。
