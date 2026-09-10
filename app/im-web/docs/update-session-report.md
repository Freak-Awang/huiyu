**【当前更新机制】**

审查范围为 `E:\CodeX\linghui-im\app\im-web`，并只读检查了后端 AuthController、AuthServiceImpl、TokenAuthenticationService 和 UpdateCheckResponse。

| 审查项 | 修改前的实际情况 |
| --- | --- |
| A 更新器 | 自研 updater，使用 Electron net.fetch 检查 /api/v1/update/check、Range 下载、SHA256 和可选 RSA；没有 electron-updater 依赖。 |
| B 点击更新 | 手动检查设置 manualCheckInProgress，下载完成便自动进入本地 quitAndInstall 函数；spawn 安装 EXE，参数仅 --updated，500 ms 后 app.exit。 |
| C quitAndInstall | 同名自研函数，并不是 electron-updater.quitAndInstall。 |
| D 安装后启动 | 可见 NSIS 向导，没有 /S、--force-run 保证；是否启动依赖向导完成操作。 |
| E 页面选择 | 一个 BrowserWindow + Vue hash router；auth store 初始 token 为空，守卫先跳 Login；Login 在 autoLogin 为 true 时异步恢复，Chat 挂载后还会再次初始化。 |
| F 凭据位置 | renderer localStorage 的 token、imCurrentUserId；Pinia 仅内存状态，未使用 persistedstate/electron-store/cookies 存储认证。 |
| G 刷新机制 | 后端存在 POST /api/auth/refresh，但接受同一个 JWT，并先验证它仍有效、未撤销；客户端原先没有调用。没有独立 refreshToken 字段。 |
| H 启动清理 | 没有启动 logout API 调用；但 loadFromStorage 对任何异常都删 token。另有基于 --updated/--show-login 的 consumeShowLogin 遗留 IPC，未发现 renderer 消费。 |
| I 更新清理 | 未发现更新/正常退出清理 renderer storage、userData 或调用 logout；原 updater stop 只清理更新状态。 |
| J 身份与安装 | name=arttalk-desktop、appId=com.im.desktop、productName=ArtTalk；没有 app.setPath('userData', ...)；NSIS 为 x64、oneClick=false、perMachine=false、允许原安装向导改目录。 |

现已接入 electron-updater，并使用其[自定义 Provider 扩展机制](https://www.electron.build/docs/api/builder-util-runtime.interface.custompublishoptions/)适配现有 JSON 更新接口。没有修改服务器接口或发布后台。

**【发现的问题】**

1. 手动检查会在下载完成后擅自安装，且 NSIS 向导可见。
2. 没有明确的 force-run 参数保证安装后启动；定时 app.exit 绕过正常退出清理。
3. Renderer 安装按钮没有即时锁定，installing 还会使弹窗消失；失败状态也无法正常展示。
4. 会话恢复依赖 Login 挂载和旧 autoLogin 开关，路由守卫早于恢复，且存在重复 /me 请求。
5. 任意 /me 网络失败都删除 token；401 拦截器又直接删 token/跳路由，没有尝试现有 refresh。
6. RSA 公钥读取或解析失败时原代码降级为校验通过；现只在公钥确实不存在时保持原 SHA256 模式。
7. 引入 updater 时必须覆盖它的独立网络 Session，否则 defaultSession 中的内部 CA 设置不会自动覆盖更新下载。
8. 本机 npm 11.16.0 的 list --json --long 返回空输出，导致 electron-builder 依赖收集失败；使用临时 npm 10.9.4 完成构建。

**【修改文件】**

所有改动都在现有工作区基础上完成，没有重置暂存区或覆盖用户的 0.0.15 版本选择。

| 文件路径 | 修改内容 | 修改原因 |
| --- | --- | --- |
| [electron/updater.ts](E:/CodeX/linghui-im/app/im-web/electron/updater.ts) | 用 electron-updater 6.8.9 接管下载及 NSIS 安装；在同一文件内适配现有 JSON API、设备 ID、灰度头及 SHA256/RSA；下载完成广播原 IPC；安装前重新校验，准备退出后调用 quitAndInstall(true, true)；加入开发保护、并发保护和脱敏日志。 | 去除可见安装向导、定时 app.exit 和下载完成自动安装；保留现有服务器协议。 |
| [electron/main.ts](E:/CodeX/linghui-im/app/im-web/electron/main.ts) | 移除未被消费的更新后强制登录 IPC；安装准备阶段共用传输进度保存；安装开始后 before-quit/close 放行；保留单实例锁，无锁实例不创建窗口。 | 确保旧进程真实退出，避免跳过传输保存或重复安装。 |
| [electron/internalCertificateTrust.ts](E:/CodeX/linghui-im/app/im-web/electron/internalCertificateTrust.ts) | 允许传入目标 Electron Session，默认仍为 defaultSession。 | 让 updater 的独立 Session 使用同一 CA 验证函数，校验规则不变。 |
| [electron/preload.cts](E:/CodeX/linghui-im/app/im-web/electron/preload.cts) | 保留 update:quit-and-install 等原白名单；移除取消“下载后自动安装”的废弃入口。 | 不引入第二套 IPC。 |
| [src/types/desktop.d.ts](E:/CodeX/linghui-im/app/im-web/src/types/desktop.d.ts) | 同步删除废弃 cancelAutoInstall 类型。 | 保持 preload 与 renderer 类型一致。 |
| [src/stores/update.ts](E:/CodeX/linghui-im/app/im-web/src/stores/update.ts) | 按钮即时锁定；installing 状态持续展示；检查更新只下载；稍后只隐藏；错误可展示/重试；保留退出安装复选框和单个事件订阅。 | 明确用户安装意图，避免重复点击和安装时弹窗消失。 |
| [src/components/UpdateDialog.vue](E:/CodeX/linghui-im/app/im-web/src/components/UpdateDialog.vue) | 更新完成、稍后、立即重启及安装中说明；安装中禁用按钮；下载进度来自实际事件。 | 实现指定提示与安装反馈。 |
| [src/stores/auth.ts](E:/CodeX/linghui-im/app/im-web/src/stores/auth.ts) | 加入 initializing/authenticated/unauthenticated；单个 restoreSession 任务；/me 校验、401 后调用现有 refresh；成功立即持久化新 JWT；网络失败保留 token；代际校验阻止迟到响应恢复已退出账号。 | 统一启动恢复，区分会话失效与临时网络异常。 |
| [src/api/auth.ts](E:/CodeX/linghui-im/app/im-web/src/api/auth.ts) | 封装已有 /api/auth/refresh，使用原 JWT Authorization；登录/退出/刷新绕过通用恢复，显式退出携带旧 token。 | 复用真实后端协议，避免恢复递归。 |
| [src/api/index.ts](E:/CodeX/linghui-im/app/im-web/src/api/index.ts) | 移除直接 localStorage 删除和 router 跳转；注册认证恢复回调；处理 HTTP/业务 401，至多重试一次；限制跨账号迟到请求。 | 统一认证失效处理，防止循环及旧请求以新账号身份重放。 |
| [src/api/user.ts](E:/CodeX/linghui-im/app/im-web/src/api/user.ts) | getProfile 接受请求配置。 | 启动校验自己处理 401，不触发递归恢复。 |
| [src/main.ts](E:/CodeX/linghui-im/app/im-web/src/main.ts) | Pinia 创建后、router 安装前注册认证恢复回调。 | 确保 router 和请求拦截器使用同一认证 store。 |
| [src/router/index.ts](E:/CodeX/linghui-im/app/im-web/src/router/index.ts) | 守卫等待 restoreSession；有效会话访问 Login 自动转 Chat；临时失败由 Bootstrap 承载。 | 避免凭据尚未恢复时被判为未登录。 |
| [src/App.vue](E:/CodeX/linghui-im/app/im-web/src/App.vue) | 启动页、手动/定时/online 重试；认证状态与目标路由同时就绪后才渲染页面；有效认证后启动更新检查。 | 包括网络重试成功在内均避免 Login 闪现。 |
| [src/views/Login.vue](E:/CodeX/linghui-im/app/im-web/src/views/Login.vue) | 删除页面挂载后的自动恢复逻辑及旧“自动进入”复选框，保留记住账号。 | 已有凭据统一在 Bootstrap 恢复，不再受旧 autoLogin 布尔值阻止。 |
| [src/views/Chat.vue](E:/CodeX/linghui-im/app/im-web/src/views/Chat.vue) | 删除挂载时再次 auth.init。 | 认证完成才进入 Chat，随后复用原 WS / IM 初始化。 |
| [src/utils/websocket.ts](E:/CodeX/linghui-im/app/im-web/src/utils/websocket.ts) | ticket 获取失败只记固定错误信息并保持原重连。 | 避免 Axios 错误对象携带 Authorization 被打印。 |
| [package.json](E:/CodeX/linghui-im/app/im-web/package.json) | 增加固定 electron-updater 6.8.9 运行时依赖；添加 generic publish 元数据配置；打包加 --publish never；保留原版本 0.0.15 和身份/安装配置。 | 支持标准 NSIS 更新器、生成 latest.yml，并保持构建仅生成本地产物。 |
| [package-lock.json](E:/CodeX/linghui-im/app/im-web/package-lock.json) | 记录新增 updater 及其依赖，保留用户已有版本修改。 | 确保安装与验收使用同一 updater API。 |
| [electron/updater.test.ts](E:/CodeX/linghui-im/app/im-web/electron/updater.test.ts) | 更新 IPC、CA Session、SHA256 Provider、开发模式、重复安装、磁盘篡改、准备失败、退出偏好及真实 NsisUpdater 参数测试。 | 覆盖更新链路与当前依赖的安装语义。 |
| [electron/main.test.ts](E:/CodeX/linghui-im/app/im-web/electron/main.test.ts) | 托盘关闭、安装时退出放行、准备期间阻止重复退出、单次保存和退出安装测试。 | 覆盖退出拦截的隐藏风险。 |
| [src/stores/auth.test.ts](E:/CodeX/linghui-im/app/im-web/src/stores/auth.test.ts) | 有效/缺失会话、401 刷新、网络失败、新 JWT 保存、并发恢复及退出竞态测试。 | 覆盖恢复分支；刷新成功测试为模拟响应，并非后端支持独立 refresh token 的证明。 |
| [src/api/index.test.ts](E:/CodeX/linghui-im/app/im-web/src/api/index.test.ts) | 401 重试、恢复请求绕过、重试终止、网络异常、跨账号请求隔离测试。 | 覆盖统一认证拦截器。 |
| [src/stores/update.test.ts](E:/CodeX/linghui-im/app/im-web/src/stores/update.test.ts) | 稍后、安装按钮锁定、失败恢复、错误展示、单订阅及退出偏好测试。 | 覆盖 renderer 安装交互。 |
| [src/App.test.ts](E:/CodeX/linghui-im/app/im-web/src/App.test.ts) | 真实 Vue SSR 渲染检查：启动验证、旧 Login 路由未切换、Chat、Login。 | 证明认证未知及路由未就绪时不渲染登录页。 |
| [docs/update-session-report.md](E:/CodeX/linghui-im/app/im-web/docs/update-session-report.md) | 本报告、构建复现命令、验收矩阵与人工测试边界。 | 提供完整交付记录。 |

**【最终更新流程】**

现有登录后定时/手动检查 → 内部 JSON API 决定可用版本与灰度 → 后台下载并验证 SHA256（配置公钥时验证 RSA） → update-downloaded → 原 update:state-changed IPC → 显示“更新完成 / 稍后 / 立即重启” → 用户点击立即重启 → renderer 立即禁用按钮 → 主进程一次性保护 → 再次检查磁盘安装包 → 保存 P2P 传输进度 → 标记正在安装 → quitAndInstall(true, true) → 旧应用退出、托盘不拦截 → NSIS 静默更新原安装 → NSIS --force-run 启动新版 → 统一 Bootstrap 恢复会话 → Chat 初始化并重新连接 WS。

“稍后”仅关闭提示。保留原默认勾选的“退出时自动安装”；勾选时以后主动退出会进入相同安装流程。为避免两个退出安装入口，electron-updater.autoInstallOnAppQuit=false，产品级退出安装由现有 main.ts 在保存传输进度后调用。强制更新继续沿用原不可稍后关闭的规则。

旧自研 update-state.json 不再被直接信任并执行，避免重复安装同版本或运行陈旧路径。现有 API 只有 SHA256，使用 6.8.9 仍支持的 sha2 下载校验；没有伪造 SHA512。下载交由库管理，原自研 .part/Range 续传状态不迁移。跨进程缺少 SHA512 的缓存会重新检查、下载并验证。

publish 的 generic 配置用于生成 app-update.yml/latest.yml；运行时明确设置自定义 Provider，继续调用原 JSON API，不要求服务器提供该路径下的 latest.yml。此次未上传任何产物。

**【登录恢复流程】**

| 情况 | 行为 |
| --- | --- |
| 本地无 token | 进入 Login，不调用 /me 或 refresh。 |
| access token 有效 | GET /api/users/me 成功，填充现有 Pinia 和 imCurrentUserId，进入 Chat。 |
| 原协议 refresh 成功 | /me 返回 401 后请求 /api/auth/refresh；立即把返回的新 token 写回原 localStorage，再取 /me；后续 /me 网络失败也保留新 token。 |
| refresh 明确返回 401 / 会话确定无效 | clearAuth，清理认证键并进入 Login；不调用 logout API。 |
| timeout、连接/DNS/HTTPS 失败、503 等 | 保留凭据，停留 Bootstrap，5 秒间隔重试并支持“重新连接”和 online 事件；不会以网络异常推断账号失效。 |
| 正常应用退出/更新退出/WS 断开 | 不执行 logout/clearAuth；新版通过相同恢复入口重新连接原 WS。 |

**后端边界：当前系统没有独立 refresh token。** 服务端 refresh 调用 authenticate(oldToken)，拒绝过期/撤销 JWT。因此用户描述的 CASE 2（access 已过期、独立 refresh token 仍有效）在当前协议下不成立，不能由局部客户端修改实现，也没有把这一项报告为实机 PASS。新增测试验证了服务器若返回新 JWT 时客户端正确保存和恢复的分支。本次没有新增认证协议或修改后端。

**【关键代码】**

下载完成仅通知：

```ts
instance.on('update-downloaded', (event) => {
  if (!pendingInfo?.downloadInfo) return
  downloadedFilePath = event.downloadedFile
  receivedBytes = totalBytes = pendingInfo?.downloadInfo?.size || 0
  console.info('[Updater] downloaded')
  setStatus('downloaded')
  void report('download_success')
})
```

复用安装 IPC：

```ts
ipcMain.handle('update:quit-and-install', (event) => {
  guardSender(event)
  return quitAndInstall()
})
```

安装函数中的实际退出入口（此前已完成一次性保护及安装包校验）：

```ts
await prepareToInstall()
installingUpdate = true
clearTimers()
console.info('[Updater] quitting for update')
autoUpdater.quitAndInstall(true, true)
```

main 的更新退出放行：

```ts
if (isInstallingUpdate()) return
if (isUpdateInstallRequested()) { event.preventDefault(); return }
```

单个恢复任务：

```ts
function restoreSession(force = false): Promise<void> {
  if (restorePromise) return restorePromise
  if (!force && authState.value !== 'initializing') return Promise.resolve()
  restorePromise = restore().finally(() => { restorePromise = null; restoring.value = false })
  return restorePromise
}
```

Bootstrap 同时等待认证与路由：

```ts
const showBootstrap = computed(() => authStore.authState === 'initializing'
  || route.name !== (authStore.authState === 'authenticated' ? 'Chat' : 'Login'))
```

**【安全检查】**

- 未关闭 TLS，未设置 rejectUnauthorized:false、NODE_TLS_REJECT_UNAUTHORIZED=0 或全局证书放行。
- 内部 CA 仍只验证指定 IP、证书日期、SAN、签发者及签名；其他主机由 Chromium 默认校验。
- updater 的专用 Session 复用相同校验，更新下载/重定向另限制为认证服务器同源。
- 新增日志只含固定生命周期信息，不记录 token、密码、Cookie 或 Authorization；WS ticket 失败日志不再打印 Axios 请求对象。
- 未修改 appId、productName、name、EXE 名称、安装目录、userData 路径、内部 CA 文件。
- 未新增 token 存储体系、restartReason、updater.exe、app.relaunch 或定时安装脚本。
- 未修改后端 API、数据库、聊天/文件/P2P 协议。P2P 仅复用原 suspendAll 保存操作。
- 没有为验证执行安装器、上传产物或发送外部消息；未保留构建/验证服务器。

**【构建结果】**

| 检查 | 结果 |
| --- | --- |
| npm run build:renderer | PASS：vue-tsc -b + Vite 生产构建。 |
| npm run build:electron | PASS：tsc -p tsconfig.electron.json。 |
| npm run build:desktop | PASS：最终完整执行 renderer、electron、electron-builder NSIS；本机使用下列临时 npm / Electron 分发路径参数。 |
| npm test | PASS：32 个测试文件，230 项测试。 |
| git diff --check | PASS。 |
| 产物校验 | PASS：latest.yml 版本、路径、大小、SHA512；blockmap gzip/JSON；asar 中 updater=6.8.9；包内主进程、preload、renderer 与构建文件一致；CA 字节一致。 |

最初的默认打包尝试失败：本机 npm 11.16.0 的 --long 依赖列表没有 JSON；并遇到默认缓存写权限及 Electron 下载停滞。未修改系统 npm，最终成功复现命令为：

```powershell
cd E:\CodeX\linghui-im\app\im-web
$env:npm_config_cache = Join-Path (Get-Location).Path '.cache\npm'
npm exec --yes --package=npm@10.9.4 --registry=https://registry.npmjs.org -- npm run build:desktop -- --config.electronDist=node_modules/electron/dist
```

使用项目已安装且版本匹配的 Electron 39.8.10；electron-builder 26.15.3。临时 npm 仅在忽略目录 .cache，未加入产品依赖。

**【安装包】**

- [ArtTalk-Setup-0.0.15-x64.exe](E:/CodeX/linghui-im/app/im-web/release/ArtTalk-Setup-0.0.15-x64.exe)
- [latest.yml](E:/CodeX/linghui-im/app/im-web/release/latest.yml)
- [ArtTalk-Setup-0.0.15-x64.exe.blockmap](E:/CodeX/linghui-im/app/im-web/release/ArtTalk-Setup-0.0.15-x64.exe.blockmap)

生成时间：2026-09-10 16:03（Asia/Shanghai）。EXE 大小：97,681,510 字节。

latest.yml：version=0.0.15，path=ArtTalk-Setup-0.0.15-x64.exe。

SHA512（与 EXE 实际计算值相同，未改写清单）：

```text
wGwyc7312O4dg0lVcfTWh0DJvmj5d8FxmeIbl2CAIK1bgCwK/GPYgbe4R2eoz5bo5JBh2DWdQyJxF7LLSZioiw==
```

**【仍需人工测试】**

| 用户场景 | 已验证的范围 | 尚需实机验证 |
| --- | --- | --- |
| CASE 1 有效 token 更新后进入 Chat | 恢复、窗口退出、安装参数及包内容测试通过 | 安装旧版 → 发布更高版本 → 静默更新 → 新版恢复真实会话。 |
| CASE 2 过期 access + 有效 refresh token | 客户端刷新成功分支模拟测试通过；当前后端无独立 refresh token | 当前协议无法完成，不能标记 PASS。 |
| CASE 3 refresh 401 | 凭据清理、Login 分支测试通过 | 真实过期/撤销 JWT 联调。 |
| CASE 4 从未登录 | 无凭据直接 Login 测试通过 | 安装包启动确认。 |
| CASE 5 网络不可达 | /me 和 refresh 网络失败均保留凭据、重试与新 JWT 保留测试通过 | 内网断网/后端重启/证书错误后恢复连接。 |
| CASE 6 不留托盘并自动启动 | close/before-quit 放行及真实 NsisUpdater /S --force-run 参数测试通过 | 真实 NSIS 替换、退出时序、单实例锁与启动权限。 |
| CASE 7 连续点击 | renderer/main 各一层保护测试通过 | 实际窗口操作可随安装测试完成。 |
| CASE 8 稍后 | 不触发安装及退出偏好测试通过 | 托盘退出与复选框组合。 |
| CASE 9 普通重启恢复 | 同一 Bootstrap 入口、localStorage 保留、重复初始化消除 | 旧安装目录下 userData/localStorage 升级前后对照。 |
| CASE 10 开发模式 | updater 检查/安装跳过测试通过 | 未启动长期 dev server。 |

版本仍为用户工作区已有的 0.0.15；已经安装 0.0.15 的客户端不会把相同版本视为可用更新。验证本包请从更低版本升级；验证本次新增更新器的完整安装链路，需要先安装本包，再发布一个实际更高版本。没有擅自修改版本或部署服务器。

