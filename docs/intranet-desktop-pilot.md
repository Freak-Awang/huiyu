# 企业 IM 内网桌面试点部署说明

本文档用于把当前项目部署为“单台内网服务器 + Windows 桌面客户端 + Web 管理后台”的试点环境。

## 1. 产物

- 员工端：`app/im-web/release/*.exe`，Windows x64 NSIS 安装包。
- 管理后台：`app/im-admin/dist`，由 Nginx 通过 `/admin` 提供访问。
- 服务端：Spring Boot 后端、MySQL、Redis、Nginx 由 Docker Compose 统一部署。

## 2. 构建

在仓库根目录执行：

```powershell
cd app\im-web
npm.cmd ci
npm.cmd run build:desktop

cd ..\im-admin
npm.cmd ci
npm.cmd run build

cd ..\im-backend
mvn test
```

生成桌面安装包后，将 `app/im-web/release/*.exe` 分发给员工电脑。

## 3. 服务器部署

在服务器上复制 `app/docker/.env.example` 为 `app/docker/.env`，至少替换：

- `MYSQL_ROOT_PASSWORD`
- `JWT_SECRET`
- `NGINX_PORT`

启动服务：

```powershell
cd app\docker
docker compose -f docker-compose.intranet.yml --env-file .env up -d --build
```

默认入口：

- 员工客户端服务器地址：`http://<服务器IP或域名>`
- 管理后台：`http://<服务器IP或域名>/admin`
- Nginx：默认暴露 `80`
- MySQL、Redis、后端端口不在内网 compose 中直接暴露给员工电脑

## 4. 数据库初始化与迁移

全新数据库会自动执行 `app/im-backend/sql/schema.sql`。

如果是旧试点库，先备份数据库，再执行：

```powershell
docker exec -i im-mysql mysql -uroot -p%MYSQL_ROOT_PASSWORD% im_db < ..\im-backend\sql\migrations\20260525_add_conversation_member_is_muted.sql
```

该迁移用于修复旧库缺少 `im_conversation_member.is_muted` 导致的 `Unknown column 'is_muted'` 错误。

## 5. 客户端配置

桌面客户端首次启动时，在登录页填写服务器地址，例如：

```text
http://192.168.1.10
```

地址会保存在当前 Windows 用户的本地配置中。员工电脑不需要安装 Java、MySQL、Redis 或后端服务。

## 6. 初始账号与安全处理

`schema.sql` 默认提供管理员账号：

```text
admin / admin123
```

试点前必须登录管理后台修改默认管理员密码，并创建至少两个普通用户用于多用户联调。

客户端和管理后台只保留“记住账号”，不再把明文密码写入 `localStorage`。

## 7. 验收场景

- 管理员创建部门和两个普通用户。
- 两台员工电脑安装桌面客户端，填写同一个内网服务地址。
- 两个普通用户分别登录，完成单聊、群聊、文本消息、图片/文件收发。
- 断开网络后恢复，确认 WebSocket 可重连，历史消息可拉取。
- 管理后台禁用用户后，确认该用户无法继续正常使用。

## 8. 回滚

停止服务：

```powershell
cd app\docker
docker compose -f docker-compose.intranet.yml --env-file .env down
```

保留数据卷时不要删除 `mysql-data` 和 `upload-data`。如需回滚应用版本，重新部署上一版前端 `dist`、后端镜像和桌面安装包。
