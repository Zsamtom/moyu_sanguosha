# Ubuntu 部署

目标机器需要 Docker、Docker Compose、Nginx 和 Certbot。

1. 将项目同步到 `/opt/sanguosha-online`。
2. 在该目录创建 `.env`，至少设置：
   - `POSTGRES_PASSWORD`
   - `SESSION_SECRET`
   - `INITIAL_ADMIN_USERNAME`
   - `INITIAL_ADMIN_PASSWORD`
   - `APP_ORIGIN=https://moyu.pdcat.cn`

   `POSTGRES_PASSWORD` 会进入 PostgreSQL 连接 URL，请使用 URL-safe 随机字符（字母、数字、`_`、`-`），或先进行 URL 编码。
   建议同时设置非敏感发布标识 `APP_VERSION`（例如版本号）和 `BUILD_SHA`（7 至 64 位十六进制源码摘要）。`APP_VERSION` 也用于版本化应用镜像标签；两者会写入镜像，并由 `/version` 返回。不要在这两个变量中放置密钥。
3. 执行 `docker compose up -d --build`。
4. 将 `nginx-moyu.conf` 放入 `/etc/nginx/sites-available/moyu.pdcat.cn` 并启用。
5. 通过 `nginx -t` 后重载 Nginx。
6. 域名解析生效后执行：

   ```bash
   certbot --nginx -d moyu.pdcat.cn --redirect
   ```

应用容器不会直接暴露到公网，只绑定宿主机 `127.0.0.1:3100`。Socket.IO 路径必须保留 Upgrade 请求头。

部署完成后应确认应用容器状态为 `healthy`，并核对健康状态和实际发布版本：

```bash
docker compose ps
curl -fsS https://moyu.pdcat.cn/healthz
curl -fsS https://moyu.pdcat.cn/version
```
