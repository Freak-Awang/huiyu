# 右键菜单改造结果

完成日期：2026-09-14。实现采用现有 Vue 3 / Pinia / Electron 隔离架构。

统一菜单、文本/图片/P2P 文件菜单、组织联系人/群成员/输入框入口、回复、转发、多选、本机收藏与删除已接入。缺少账户接口或窗口协调能力的功能未伪装成可用命令，详见第 19、20 项。

2026-09-14 撤回入口兼容修正：此前策略初始值为零，且刷新时先清零，导致旧服务器缺少 `/api/messages/policy`、请求未完成或暂时失败时，自己的新消息也不显示撤回。现已沿用现有后端的两分钟规则作为兼容默认值；成功取得策略后优先使用服务器时间和期限，刷新失败保留已知策略，服务器明确返回零时仍禁止撤回。兼容模式使用本机时间作为初始基准和单调时钟推进，实际撤回仍由已有服务端接口最终校验。没有修改后端的撤回权限或期限。

2026-09-14 入口精简：按反馈移除消息气泡下方、时间/已读状态旁的“回复”和“撤回”按钮，统一从右键菜单操作。保留原有回复/撤回业务函数、发送状态和失败重试入口。

## 1. 新增文件

以下路径相对 `app/im-web`：

| 文件 | 用途 |
| --- | --- |
| `src/components/context-menu/types.ts` | 菜单数据模型、无动画尺寸的边界计算、键盘索引 |
| `src/components/context-menu/useContextMenu.ts` | 单实例会话、打开/关闭、选区快照 |
| `src/components/context-menu/ContextMenu.vue` | 唯一 Host、Teleport、生命周期、异步命令异常出口 |
| `src/components/context-menu/ContextMenuPanel.vue` | 菜单项、分隔线、递归子菜单、焦点与键盘 |
| `src/components/context-menu/builders.ts` | 消息、图片、文件、会话、成员、联系人、输入框 Builder |
| `src/components/context-menu/useChatContextMenus.ts` | 菜单与已有 Store/业务函数的适配、多选与转发状态 |
| `src/components/MessageActionDialog.vue` | 转发目标选择器、本机收藏查看器 |
| `src/stores/messagePolicy.ts` | 缓存服务器撤回期限和时间，使用单调时钟推进 |
| `src/stores/messageLibrary.ts` | 当前账号本机删除标记、收藏与会话切换隔离 |
| `src/utils/messageMenuActions.ts` | 文本/图片复制、认证图片读取、保存与合法链接打开 |
| `src/utils/textLinks.ts` | 保留原文和 @ 边界的链接分段 |
| `electron/contextMenu.ts` | 剪贴板、编辑命令和图片 Save As 白名单 IPC |

新增测试：

- `src/components/context-menu/contextMenu.test.ts`
- `src/components/context-menu/builders.test.ts`
- `src/stores/messagePolicy.test.ts`
- `electron/contextMenu.test.ts`
- `electron/localMessages.test.ts`
- `electron/p2pMenu.test.ts`
- `scripts/test-context-menu-ui.mjs`
- `scripts/test-context-menu-electron.mjs`
- `scripts/context-menu-fixture/{index.html,main.ts,Fixture.vue}`
- 后端 `im-server/src/test/java/com/im/server/controller/MessagePolicyControllerTest.java`
- 后端 `im-server/src/test/java/com/im/server/service/impl/ContextMenuPermissionsTest.java`
- 本报告 `docs/context-menu-report.md`

## 2. 修改文件

- `src/views/Chat.vue`：在已有界面接入口；保留消息发送器、附件队列、回复草稿、群管理处理函数；移除旧的群成员弹出菜单 HTML。
- `src/stores/chat.ts`：展示时过滤本机删除标记；接收撤回时清理收藏快照。
- `src/api/message.ts`：增加撤回策略 GET API。
- `src/types/desktop.d.ts`：精确声明新 IPC 能力。
- `electron/main.ts`：注册新处理器；检查主窗口、主 frame 和可信来源；加强外链 URL 校验。
- `electron/preload.cts`：仅暴露命名白名单方法。
- `electron/localMessages.ts`：复用加密、原子写入及串行队列，增加删除标记与收藏；损坏时保留原文件并报错。
- `electron/p2pNative.ts`：从当前账号的已知任务定位文件，打开发送源、另存为文件及生成新的转发源。
- 后端 `MessageController.java`、`MessageService.java`、`MessageServiceImpl.java`：只读策略接口，与已有撤回校验共享两分钟常量。

任务开始前已有登录、认证、设置、图标、版本号及其他报告改动。未覆盖这些修改，也未修改它们来实现菜单。未修改 Docker、Nginx、MySQL、Redis 或服务器配置。

## 3. 删除文件

无。旧群成员操作菜单的 HTML 已移除，原来的管理按钮也使用统一菜单。

## 4. ContextMenu 架构

`Chat.vue 事件 → useChatContextMenus → 场景 Builder → useContextMenu 单实例 → ContextMenu / ContextMenuPanel → 已有业务处理器或命名 IPC`

- 数据模型支持 `id / label / icon / danger / disabled / visible / separatorBefore / shortcut / children / action`。
- 不在各消息分支复制菜单 HTML；分隔线和子菜单由同一 Panel 渲染。
- 6px 安全边距；右边/下边翻转；小窗口限制宽高并允许菜单内部滚动。
- 定位使用 `offsetWidth/offsetHeight`，避免 0.98 打开缩放造成边界测量偏差。
- 外部点击、Esc、Tab、切换聊天、resize、blur、聊天滚动、切换其他菜单、执行命令均关闭。
- 菜单内部滚动不关闭。重新右键直接替换旧 Panel，不保留第二份可交互菜单。
- ↑/↓、Home/End、Enter/空格、→/← 子菜单；跳过不可用项。
- `role=menu/menuitem`、`aria-disabled`、`aria-activedescendant`、子菜单 `aria-haspopup/expanded`；关闭恢复合理焦点。
- 复用 Design Token、现有 SVG；168–240px 宽、34px 项高、8px 圆角、13px 字号、100ms 打开/80ms 关闭；支持减弱动画偏好。
- 危险项默认正常文字，只在 Hover/键盘当前项显示危险背景和文字。
- 打开菜单不请求服务器；可见期间每 250ms 本地重新计算状态与期限。剪贴板可用性只读取本地 IPC。

## 5. 文本消息支持功能

回复、复制、转发、收藏/取消收藏、多选、符合服务器期限时撤回、本机删除；失败消息保留复制/重试/删除，发送中的消息隐藏不适用命令。

选区在菜单夺取焦点前保存，只复制当前消息内选中的文字；未选中文字则复制整条文本。HTTP/HTTPS 链接段提供打开链接、复制链接，并保留消息操作；危险协议作为普通文本展示。

回复继续使用原有 `content.replyTo = {messageId,senderName,text}`，输入区显示发送人、摘要、取消按钮，发送时由 `buildTextMessageContent` / `messageSender` 携带真实字段。

## 6. 图片消息支持功能

查看大图、复制图片、回复、转发、另存为、收藏、多选、按权限撤回、本机删除。

- 复用 `downloadFileBlob` 认证下载。
- `clipboard.writeImage(nativeImage)` 写入真实图片，不以 URL 替代。
- 复制/另存为 IPC 接受最大 20MB 编码数据，并验证解码有效性和像素尺寸。
- 图片另存为经 OS 对话框保存 PNG；动图复制/PNG 保存为静态图片。
- 转发走原有图片附件队列，并重新上传到目标会话，避免复用原会话文件访问权限。

## 7. 文件消息支持功能

- 未接收的合法 P2P 文件提供下载；接收中/校验中不显示完成态命令。
- 本机完成的接收文件，或本机仍可用的发送源，提供打开、打开所在位置、文件另存为、转发、多选、按期限撤回及本机删除。
- 执行时主进程重新验证任务、账号、路径、文件存在性；本机路径变成符号链接/目录链接时拒绝。
- 另存为不能覆盖原文件本身，保存位置来自系统对话框；对话框期间切换账号会停止操作。
- 转发生成新的源标识，再进入原有附件队列和 P2P offer 流程；不复制原会话传输 token。
- 文件/文件夹转发沿用现有产品限制，只支持单聊。文件夹提供打开、位置、转发；本次不递归另存为文件夹。
- 旧版服务器 FILE/FOLDER 消息仍保持停用提示，未恢复已停用的上传/下载协议。

## 8. 会话列表支持功能

右键目标会话提供标为已读（当前有未读时）、置顶/取消置顶、消息免打扰/取消消息免打扰。已置顶列表和群聊列表同样接入。

不支持的标为未读、独立窗口、账户清空历史、从最近列表删除会话暂不显示；没有将解散群聊 API 接到“删除会话”。原抽屉的本机缓存清理明确改名为“清理本机消息缓存”，确认说明服务器历史不删除，且落盘失败时不清空界面或附件草稿。

## 9. 好友菜单支持功能

当前项目实际是组织通讯录，支持发送消息、查看资料；自己的头像仅提供资料。没有用用户资料全局备注字段冒充个人好友备注，也没有把删除组织用户当作删除好友。

修改备注、删除好友需要账户好友关系接口；相关 Builder 扩展位已预留，当前不显示。未来接入删除好友时必须增加明确确认框。

## 10. 群成员菜单支持功能

@TA、资料、私聊；群主可设置/取消管理员、移出其他成员，且复用原有转让群主功能；管理员可移出普通成员，不能移出群主/同级管理员；自己只显示有意义的资料操作。

成员列表、群成员网格、消息头像均接入。@TA 复用原 @ 选择器的数据生成方法，不只是插入显示文字。移出群聊与转让群主保留现有确认框。

## 11. 输入框菜单支持功能

撤销、重做、剪切、复制、粘贴、全选。结合原生 undo/redo 状态、textarea 选区/禁用状态、系统剪贴板类型动态 disabled，保留全部标准编辑项。

执行前恢复 textarea 焦点与选区，使用窄化 `WebContents` 编辑命令；粘贴继续触发现有输入事件与图片粘贴处理流程。Web 环境的系统剪贴板能力取决于浏览器权限；完整标准编辑体验以桌面端为准。

## 12. IPC 新增内容

| 通道 | 作用 |
| --- | --- |
| `clipboard:state` | 只返回有无文本/图片，不回传剪贴板正文 |
| `clipboard:write-text` | 长度受限的文本复制 |
| `clipboard:write-image` | 受限真实图片复制 |
| `editor:command` | 仅六种标准编辑命令 |
| `image:save-as` | OS 选择位置后保存 PNG |
| `messages:library` | 当前账号本机收藏及删除标记 |
| `messages:library-update` | 最多 100 条批量收藏/删除/取消收藏 |
| `p2p:save-as` | 按已知任务 ID 另存为文件 |
| `p2p:task-source` | 从已有本机任务构造新的转发源 |

复用 `p2p:open-result`、`p2p:reveal-result`、现有图片下载与附件源/任务 IPC；没有通用 fs、shell、任意路径或任意脚本执行入口。

## 13. API 调用变化

新增 `GET /api/messages/policy → { recallWindowMs, serverTime }`，登录后 WebSocket 连接/重连时获取并缓存，右键打开不调用。

其他操作继续使用已有已读、pin/mute、撤回、成员角色/移除、图片上传与 WebSocket MESSAGE_SEND / P2P offer API。文本转发清理原消息的 @ 和回复结构，按新消息通过现有发送器提交；转发成功提示表示“已提交”，发送失败和重试仍由原会话状态展示。

本机删除、收藏不调用服务器删除/撤回 API。

## 14. 后端变化

仅增加上述只读策略接口和共享期限 getter，以及测试；无需数据库迁移、基础设施配置或消息协议变更。现有撤回继续清空原内容、设置 `RECALLED` 并通过 WebSocket 更新双方。

策略接口为可选增强，不再作为既有撤回功能可用的前提。旧服务器没有接口时，客户端按现有 `MessageServiceImpl.RECALL_LIMIT_MINUTES = 2` 规则展示入口；有接口时使用其实际策略。右键菜单打开仍不发起网络请求。

## 15. 权限逻辑

菜单根据消息类型、消息是否实际发送成功、发送者、当前账号、群成员列表角色、文件状态、选区和服务器期限计算。

撤回同时校验已发送的服务端消息 ID、当前发送者身份、非 FAILED/SENDING/RECALLED 及有效期限；有策略接口时使用服务器时钟，否则使用本机时钟基准和已知旧版两分钟规则。执行时再检查，最终由服务器决定。服务端限制仍为两分钟。

群成员管理复用服务端 `removeMember` / `updateMemberRole`，UI 隐藏项不承担安全职责。新增后端测试验证普通成员无权移除他人、管理员只能移除普通成员、群主可移除管理员/普通成员，以及撤回非本人和超时消息会被拒绝。

## 16. 安全检查结果

- 保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，不使用 remote。
- IPC 校验主窗口身份、主 frame 与可信 renderer URL。
- 两端验证外链 URL；拒绝 javascript/file/data 等协议、无效 URL、控制字符及 URL 内凭据。
- 文件操作由当前账号的已知任务查找路径；不能传入一个路径冒充任务 ID。
- 保存路径只来自 OS 对话框；未增加 Renderer Node 能力。
- 本机收藏/删除标记复用安全存储加密和原子串行写入；失败不显示成功；损坏文件不被当成空存储覆盖。
- 删除标记同时覆盖服务端 ID 和客户端 ID，ACK/历史重放及清理缓存后不会复活。
- 撤回清理收藏快照；收藏写入时也拒绝已经在主进程标为撤回的消息。
- 没有全局屏蔽 contextmenu。监听器只在外部事件发生时关闭已有菜单。
- 没有发现本次接入的群管理、撤回 API 缺少关键身份/角色校验。

## 17. Build 结果

- `npm run build`：通过。
- `npm run build:electron`：通过。
- `npm run build:desktop`：通过，撤回兼容及气泡入口精简版重新生成 `release/ArtTalk-Setup-0.0.18-x64.exe`，97,624,831 字节（2026-09-14 14:55）。包内 Renderer 已与本次构建产物逐字节核对。
- 当前系统 npm 11.16.0 的 `npm list --json --long` 返回空输出并退出 1，导致第一次桌面打包报 `No JSON content found in output`；初次下载还遇到网络超时。使用本机已缓存 npm 10.9.4、仅为构建进程前置 PATH 后，完整脚本成功。
- 未改变系统 npm、项目依赖或 package.json；安装包未安装、未发布，版本沿用工作区已有 0.0.18。
- 本次重打包时 GitHub 下载超时，临时传入 `-c.electronDist=C:\Users\Yalo\AppData\Local\electron\Cache\electron-v39.8.10-win32-x64.zip` 使用本机同版本运行时缓存；无需更改项目配置。正在运行的已安装客户端未被关闭或覆盖。
- 隐藏的 Electron 回归窗口与构建进程均已结束，未启动或留下开发服务器。

复现 npm 兼容构建时，应使用可正常输出依赖树的 npm 10.9.4 执行相同 `npm run build:desktop`；不要改业务代码来处理打包器的依赖枚举失败。

## 18. TypeCheck、Lint 和回归结果

- `npx vue-tsc -b`：通过；涵盖 Vue/Renderer TypeScript。
- `tsc -p tsconfig.electron.json`：通过，已包含在 Electron 构建中。
- 仓库没有独立 `typecheck` 或 `lint` script，也没有配置 ESLint；已执行等效类型检查及现有编译器 noUnused/noFallthrough 检查。没有宣称执行不存在的 lint。
- Vitest：最终 `npm test` 全量运行，38 个文件、304 项测试全部通过，包含策略接口失败、初始加载、已知策略保持、时钟变化和换账号竞态测试。
- `node scripts/test-context-menu-ui.mjs`：33 项真实 Electron/Chromium + Vue 检查通过，新增旧服务器撤回菜单显示/执行、非本人和超时隐藏、打开菜单无额外请求检查。使用独立假数据和替身剪贴板，不连接真实服务器或修改系统剪贴板。
- Maven：既有消息/会话相关 25 项、新策略接口 1 项、新服务器权限测试 8 项，合计 34 项通过。
- `git diff --check`：通过。

| 场景 | 验证方式 |
| --- | --- |
| 自己/他人文本、图片，待下载/已下载文件，链接 | Builder 测试；真实组件验证文本与图片入口 |
| 撤回有效/过期/非本人/未发送/已撤回 | 策略 Store、Builder、服务器权限测试 |
| 策略接口缺失/请求失败/加载中/服务器关闭撤回/已知策略保持 | 策略 Store + 真实菜单旧服务器兼容回归 |
| 普通成员、管理员、群主、自己 | Builder 权限矩阵 + 服务器移除/角色测试 |
| 普通联系人、置顶/免打扰会话文案 | Builder 测试 |
| 空输入、输入文本、选区复制、焦点恢复 | 真实 Electron/Vue 测试 |
| 左上、右上、左下、右下、小窗口 | 几何测试 + 真实 Electron 测试 |
| 连续快速右键、Esc、Tab、blur、resize、滚动、切换聊天 | 真实 Electron/Vue 测试 |
| 子菜单方向键、执行、事件阻止和背景默认行为 | 真实 Electron/Vue 测试 |
| 文件打开/位置/另存为、转发新源、文件移走、保存期间换账号 | P2P 原生处理器测试 |
| 本机持久删除、收藏加密/隔离、异常不误报成功 | 实际临时文件存储测试 |

截图生成在 `.cache/context-menu-ui/menu-light.png` 与 `menu-dark.png`，已人工视觉检查；它们是实际菜单组件的测试界面，不是生产聊天截图。未使用真实账号进行多人线上发送、真实系统剪贴板覆盖或大文件 LAN 端到端传输；这些业务依靠现有回归、新增边界测试及代码复用验证，部署前仍建议双客户端验收。

## 19. 尚未实现功能

| 功能 | 当前处理与原因 |
| --- | --- |
| 删除最近会话且新消息自动恢复 | 不显示；现有 DELETE conversation 实际解散群聊，缺少最近列表隐藏 API |
| 账户侧清空聊天历史 | 不显示；现有能力只能清本机缓存，缺少用户历史 cutoff/API |
| 标为未读 | 不显示；缺少独立人工未读标记 API，不能撤销真实已读回执来冒充 |
| 好友备注/删除好友 | 不显示；当前为组织目录，缺少账户好友关系与个人备注 API |
| 独立聊天窗口 | 未接入；主进程的窗口控制、通知/徽标、更新和 P2P 任务目前围绕唯一主窗口，直接再挂载聊天页会引入重复任务与存储竞争。服务器本身支持多 session，限制在客户端协调层 |
| 云端收藏和跨设备删除同步 | 本次仅本机当前账号加密存储，有明确反馈和收藏入口 |
| 向群聊转发 P2P 文件、文件夹整体另存为 | 沿用现有 P2P 单聊约束；文件夹可打开位置或转发至单聊 |
| 转发目标搜索未建立会话的联系人 | 本次目标选择器使用现有会话列表；可先建立会话再选择 |

未实现项目没有绑定占位成功函数；有后端缺口的命令不显示。撤回和本机删除已完全分离。

## 20. 后续建议及最小接口方案

以下是设计建议，尚未创建接口或变更数据库：

1. **最近会话隐藏**：新增 `DELETE /api/conversations/{id}/recent`；在当前用户成员视图保存 `hiddenAt/hiddenBeforeMessageId`，不删除成员关系、群或消息。出现更新的会话消息时重新纳入列表。
2. **账户历史清空**：新增 `DELETE /api/conversations/{id}/history`；事务中保存当前用户 `clearedBeforeMessageId`，历史查询、搜索、pending/read 视图统一处理可见性，不能删除其他用户共享消息。客户端必须确认，成功后才刷新。
3. **人工未读**：新增 `PUT /api/conversations/{id}/unread`；独立持久化 `manualUnread`，与真实阅读回执分开，列表返回这一状态。
4. **好友关系**：增加按 ownerUserId + targetUserId 的关系和个人 remark；提供备注 PUT、好友 DELETE；服务端校验当前账号关系所有权，删除好友必须确认。
5. **跨设备删除/收藏**：可新增账户消息可见性/收藏表，唯一键为 userId + messageId；本机删除标记可作为同步基础，不能用共享消息的 `status` 表达用户删除。
6. **独立窗口**：先建立窗口注册表、窄化会话 IPC 权限和共享 P2P/草稿协调层，再打开子窗口；通知与更新由主窗口统一协调，登出关闭或清空全部子窗口。不要放宽现有 sender 检查来简单接受任意窗口。
7. **发布验收**：用两台桌面客户端验证回复字段、双方撤回提示、真实图片剪贴板、P2P 文件重传与转发、断网恢复、换账号隔离。推荐部署策略 API 以获得服务器时钟和动态期限；旧服务器已兼容现有两分钟撤回。未提供真实凭据，本次没有替用户进行线上发送或服务器部署。
