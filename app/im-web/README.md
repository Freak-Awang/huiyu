# ArtTalk desktop client

Vue 3、TypeScript、Vite 与 Electron 构建的 ArtTalk 桌面客户端。

## Verification

```powershell
npm.cmd run build
npm.cmd run build:electron
npm.cmd test
npm.cmd run verify
npm.cmd run audit:runtime
```

## Build-tool security

运行时依赖必须保持 `npm audit --omit=dev` 零已知漏洞。完整 `npm audit` 当前会在
`electron-builder` 的打包依赖链中报告 `brace-expansion` 内存耗尽 DoS；该依赖不进入
应用运行时，且上游暂未提供完整自动修复。

- 构建任务只处理仓库内受信任的路径与打包配置，不接受用户提交的 glob 表达式。
- CI/发布构建在隔离、限时和限内存的执行环境中运行。
- 升级 `electron-builder` 后必须重新执行完整审计；上游提供兼容修复后立即移除风险版本。
- 不使用 `npm audit fix --force` 绕过锁文件或引入未经验证的主版本升级。
