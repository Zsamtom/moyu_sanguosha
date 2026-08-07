# Docker 生产部署

本文以 Ubuntu 22.04/24.04、域名 `moyu.pdcat.cn` 和项目目录 `/opt/sanguosha-online` 为例。生产服务器只需要 Docker、Docker Compose、Nginx、Certbot 和 Git；Node.js、pnpm、PostgreSQL 均由容器提供。

## 1. 部署结构

```text
Internet
  -> Nginx :80/:443
  -> 127.0.0.1:3100
  -> app 容器 :3000
  -> db 容器 :5432
  -> sanguosha_db Docker volume
```

应用端口只绑定到服务器回环地址，不直接暴露到公网。数据库不映射宿主机端口。

## 2. 首次准备服务器

以具有 `sudo` 权限的账号登录服务器：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

重新登录 SSH 后确认：

```bash
docker --version
docker compose version
sudo nginx -t
```

域名 A/AAAA 记录必须先指向服务器公网地址。

## 3. 获取 main 分支源码

```bash
sudo mkdir -p /opt/sanguosha-online
sudo chown "$USER":"$USER" /opt/sanguosha-online
git clone --branch main --single-branch https://github.com/Zsamtom/moyu_sanguosha.git /tmp/moyu_sanguosha
cp -a /tmp/moyu_sanguosha/sanguosha-online/. /opt/sanguosha-online/
cd /opt/sanguosha-online
```

以后升级不要复制 `local/`、压缩包、`node_modules/`、`dist/` 或开发机 `.env`。

## 4. 创建生产环境变量

在 `/opt/sanguosha-online/.env` 写入：

```dotenv
POSTGRES_PASSWORD=替换为仅含字母数字下划线或短横线的随机密码
SESSION_SECRET=替换为至少32位随机字符串
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=替换为首次登录密码且至少8位
INITIAL_ADMIN_DISPLAY_NAME=管理员
APP_ORIGIN=https://moyu.pdcat.cn
APP_VERSION=2026.07.20
BUILD_SHA=替换为main分支的Git提交SHA

# 可选：三国杀与斗地主 DeepSeek 机器人首次启动引导；三项全部留空时禁用
DOUDIZHU_LLM_ENDPOINT=https://api.deepseek.com/chat/completions
DOUDIZHU_LLM_API_KEY=替换为服务端密钥
DOUDIZHU_LLM_MODEL=deepseek-v4-flash
DOUDIZHU_LLM_TIMEOUT_MS=10000
DOUDIZHU_LLM_MAX_OUTPUT_TOKENS=4000
```

可在本机生成随机值：

```bash
openssl rand -hex 24
openssl rand -hex 32
git rev-parse HEAD
```

注意：

- `.env` 只保存在服务器，权限设为 `600`，绝不提交 Git。
- `POSTGRES_PASSWORD` 会直接进入数据库 URL，只使用 URL-safe 字符。
- 初始管理员已存在时，修改 `INITIAL_ADMIN_PASSWORD` 不会覆盖数据库里的密码。
- `APP_VERSION` 用于 Docker 镜像标签；`BUILD_SHA` 会由 `/version` 返回。
- 大模型 API Key 只保存在服务器 `.env`；不要写入源码、浏览器配置或 Git。

```bash
chmod 600 .env
```

## 5. 构建并启动

```bash
cd /opt/sanguosha-online
docker compose config --quiet
docker compose build --pull app
docker compose up -d
docker compose ps
```

首次构建需要下载 Node.js 与 PostgreSQL 镜像。等待 `db` 和 `app` 均显示 `healthy` 后，在服务器本机验证：

```bash
curl -fsS http://127.0.0.1:3100/healthz
curl -fsS http://127.0.0.1:3100/version
docker compose logs --tail=100 app
```

## 6. 配置 Nginx 与 HTTPS

```bash
sudo cp deploy/nginx-moyu.conf /etc/nginx/sites-available/moyu.pdcat.cn
sudo ln -sfn /etc/nginx/sites-available/moyu.pdcat.cn /etc/nginx/sites-enabled/moyu.pdcat.cn
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d moyu.pdcat.cn --redirect
sudo certbot renew --dry-run
```

`/socket.io/` 必须保留 HTTP/1.1、`Upgrade` 和 `Connection` 请求头，否则实时对局会断开。

Certbot 会在首次签发后改写站点文件以加入 HTTPS；后续更新 Nginx 模板时，先用
`sudo nginx -T` 确认正在生效的 TLS `server` 块，再把新增指令合并进去，**不要**
直接覆盖已由 Certbot 管理的文件。庄园接口依赖 JSON gzip，合并后验证：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

然后在已登录浏览器的 Network 面板中确认 `GET /api/homestead` 返回头包含
`Content-Encoding: gzip`；`/version` 很小，低于压缩阈值时不适合作为此项验收。

公网验收：

```bash
curl -fsS https://moyu.pdcat.cn/healthz
curl -fsS https://moyu.pdcat.cn/version
```

随后使用浏览器完成管理员登录、创建账号、开房、机器人对局和断线重连检查。

## 7. 日常升级

先在开发机确认 `main` 已通过 `pnpm check`，再在服务器执行：

```bash
cd /opt/sanguosha-online
docker compose exec -T db pg_dump -U sanguosha -d sanguosha -Fc > "backup-$(date +%Y%m%d-%H%M%S).dump"
```

将新的 `sanguosha-online/` 同步到 `/opt/sanguosha-online/`，保留服务器 `.env` 和备份文件，然后更新 `.env` 中的 `APP_VERSION`、`BUILD_SHA`：

```bash
docker compose config --quiet
docker compose build --pull app
docker compose up -d --remove-orphans
docker compose ps
curl -fsS https://moyu.pdcat.cn/healthz
curl -fsS https://moyu.pdcat.cn/version
```

Compose 会替换应用容器，不会删除 `sanguosha_db` volume。

### Windows 本地一键部署

项目已提供 PowerShell 发布脚本。默认部署到 `ubuntu@49.51.188.128`，使用
`%USERPROFILE%\Downloads\tets.pem`，并验证 `https://moyu.pdcat.cn`：

```powershell
pnpm deploy:prod
```

第一次使用或只想检查 SSH、Docker、应用和数据库连通性时执行：

```powershell
pnpm deploy:prod:check
```

如密钥位于其他目录，可以直接调用脚本并覆盖参数：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-production.ps1 `
  -KeyPath "D:\keys\moyu.pem"
```

脚本会自动读取线上版本号、生成当天的下一个生产版本、执行本地构建、排除
`.env` 和依赖目录、备份线上源码和 PostgreSQL、在独立目录构建镜像、切换
服务并验证 HTTPS。新版本内部健康检查失败时会自动恢复上一个版本；发布备份
和回滚目录会保留在服务器，临时密钥副本与压缩包会自动清理。

## 8. 回滚与恢复

应用回滚：重新同步上一个 Git 提交对应的 `sanguosha-online/`，恢复相应 `APP_VERSION` 和 `BUILD_SHA`，再执行：

```bash
docker compose build app
docker compose up -d
```

数据库恢复会覆盖现有数据，必须先确认目标备份：

```bash
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists -U sanguosha -d sanguosha < backup-YYYYMMDD-HHMMSS.dump
docker compose start app
```

不要执行 `docker compose down -v`；`-v` 会删除生产数据库 volume。

## 9. 常用排障

```bash
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 db
docker compose exec app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>r.text()).then(console.log)"
sudo nginx -t
sudo journalctl -u nginx --since "30 minutes ago"
```

- `healthz` 为 503：检查数据库容器健康状态和 `POSTGRES_PASSWORD`。
- 登录后立即失效：检查 `SESSION_SECRET` 是否在重建容器时发生变化。
- WebSocket 反复断开：检查 Nginx `/socket.io/` 配置和 `APP_ORIGIN`。
- 页面仍是旧版本：核对 `/version`、浏览器缓存和当前运行镜像标签。
