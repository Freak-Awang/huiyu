# ArtTalk management console

Vue 3、TypeScript、Vite 与 Element Plus 构建的管理后台，用于用户、部门和桌面客户端版本管理。

## Verification

```powershell
npm.cmd run build
npm.cmd test
```

生产构建输出到 `dist/`，由服务端 Nginx 挂载到 `/admin/`。
