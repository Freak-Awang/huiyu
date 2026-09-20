# 内置 Emoji V1 交付报告

验证日期：2026-09-20。实际项目位置为 `E:\CodeX\linghui-im\app\im-web`。

## 完成范围

已接入内置 PNG Emoji、5 个分类（含最近）、最近 40 项、固定尺寸虚拟网格、可视化原子输入、光标恢复、整颗删除、草稿恢复、Token 序列化/解析、消息渲染、纯表情放大、引用/转发/复制兼容，以及 Electron 运行资源。

按后续要求删除 food、nature、new、object、people、travel 六个文件夹及其中 3104 张 PNG；保留 smile、activity、symbol、flag 共 736 张。同步精简 manifest、分类按钮和路径白名单。保留项的 ID、order 和路径不变；旧消息中已删除的表情降级为 `[表情]`，原 Token 仍可往返，最近使用记录自动过滤删除项。

沿用现有 TEXT 消息 JSON、发送确认/失败重试、Pinia 草稿、@ 提及、附件托盘和上下文菜单。后端 API、数据库和 WebSocket 协议未修改；本次未新增 V2 能力。

按后续要求移除“大表情”功能：表情按钮直接打开内置 Emoji，删除旧贴纸页签、最近使用、添加/重命名/删除管理、IndexedDB 访问模块、发送逻辑和 6 张 SVG。设置项改为“最近表情”。历史 `STICKER` 消息仅显示 `[表情已停用]`，预览/引用同样降级，关闭旧贴纸的气泡和菜单重发入口。类型识别保留以兼容历史记录。

## 1. 文件变更

以下路径相对于客户端目录。

新增运行代码：

```text
src/features/emoji/
  types.ts
  constants.ts
  index.ts
  components/
    EmojiPicker.vue
    EmojiCategoryTabs.vue
    EmojiGrid.vue
    EmojiItem.vue
    EmojiImage.vue
    EmojiRenderer.vue
    EmojiComposer.vue
  composables/
    useEmojiCatalog.ts
    useRecentEmoji.ts
    useEmojiComposer.ts
  utils/
    emojiParser.ts
    emojiSerializer.ts
    emojiMessage.ts
    emojiUrl.ts
    emojiVirtualGrid.ts
```

新增验证与文档：

```text
src/features/emoji/emoji.test.ts
scripts/validate-emoji-assets.mjs
scripts/test-emoji-ui.mjs
scripts/test-emoji-electron.mjs
scripts/emoji-fixture/
  index.html
  main.ts
  Fixture.vue
  chat.html
  chat.ts
  chat-preload.cjs
  tsconfig.json
docs/emoji/builtin-emoji-v1.md
```

修改：

```text
src/views/Chat.vue
src/api/message.ts
src/api/message.test.ts
src/components/context-menu/useChatContextMenus.ts
src/components/context-menu/useContextMenu.ts
src/components/context-menu/builders.ts
src/components/context-menu/builders.test.ts
src/components/SettingsDialog.vue
src/utils/messageMenuActions.ts
src/utils/recentUsage.ts
src/types/desktop.d.ts
electron/main.ts
electron/preload.cts
package.json
scripts/context-menu-fixture/Fixture.vue
```

资源：使用 `public/emoji/builtin/manifest.v1.json` 和 `images/` 中保留的 736 张 PNG，未重编号、替换或生成图片。该目录只有 manifest 和 images，不含 README/CSV。

删除：移除上述六个 Emoji 资源文件夹及全部图片，以及 `src/constants/stickers.ts`、`src/utils/customStickers.ts`、`src/assets/stickers/`（6 张 SVG）。移除了 Chat 中旧 Unicode 选择器和大表情模块的逻辑及样式。没有改动依赖或锁文件。

## 2. 架构

| 模块 | 工作方式 |
| --- | --- |
| Catalog | manifest 是唯一清单。模块级 Promise 缓存并共享加载结果；构建 ID Map、分类 Map，分类数组冻结并按 order 排序。失败也缓存，防止消息组件重试风暴。 |
| URL | `getBuiltinEmojiUrl` 统一验证资源路径，使用 Vite `BASE_URL`。不 import/glob 全部图片。 |
| Picker | 默认无最近记录时选笑脸；分类按钮有中文 title/aria-label。连续选择保持打开，现有 Chat 处理 Esc、点击外部、再次点击和会话切换关闭。 |
| Virtual Grid | 44px 单元格；按实际容器宽度算列数，300px 可视区、前后各 4 行 overscan；占位总高度加平移定位，仅挂载可见项。ResizeObserver 在卸载时断开。 |
| Recent | `linghui.im.emoji.recent.v1` 保存 ID 数组，去重置顶，最多 40 个，读取时按当前 catalog 过滤失效 ID。存储失败不影响输入。 |
| Composer | 轻量 contenteditable；普通文字为 Text Node，Emoji 为 `contenteditable=false` 的 span。保留最后有效 Range，恢复焦点和光标；按序列化偏移复用既有 @ 和菜单逻辑。 |
| Serializer | DOM 遍历转为原始 token 文本；反序列化使用 createTextNode/createElement。保留换行，未知 ID 同样可作为完整原子项往返。复制输出 `[表情]`，粘贴只读 text/plain；既有图片粘贴优先进入附件托盘。 |
| Parser | 只识别 `[emoji:builtin_emoji_四位数字]`；非法/不完整串仍是文本。只提取 ID，资源必须通过 catalog 查询。 |
| Renderer | Text Node/slot + img 安全渲染，不使用 v-html。原有 @ 高亮和 URL 点击在文本 slot 内保留。图片失败或未知 ID 显示 `[表情]`。 |

纯表情尺寸为 1 个 48px、2～3 个 40px、4 个以上 32px；混排和 compact 模式为 1.35em。浅/深色均使用项目既有 CSS 变量。

草稿继续按账号和会话持久化 token 文本。只给 Composer 使用账号/会话 key，切换时释放 Selection 和输入历史；未改变消息列表 key。编辑器包含本地撤销/重做历史，避免 Range 插入绕过原生撤销栈造成半颗 Token。

生产端原本使用 `BrowserWindow.loadFile`，Vite 原本使用 `base: './'`，两者保持不变。由于 file 页面 fetch 不能直接读取 JSON，新增一个不接受路径参数的固定 manifest IPC，经现有 `assertMainWindowSender` 校验后读取包内文件。开发 HTTP 页面走 fetch；PNG 始终通过统一相对 URL 使用 img 加载。

## 3. 消息数据示例

输入框 DOM（src 仅在客户端 UI 中存在）：

```html
你好 <span contenteditable="false" data-emoji-id="builtin_emoji_0001">
  <img src="./emoji/builtin/images/smile/emoji_0001.png" />
</span>
```

序列化结果：

```text
你好 [emoji:builtin_emoji_0001]
```

现有发送链路生成的 `messageType` 和服务器 `message.content`：

```json
{
  "messageType": "TEXT",
  "content": "{\"text\":\"你好 [emoji:builtin_emoji_0001]\",\"mentions\":[],\"replyTo\":null}"
}
```

接收端先沿用 `normalizeMessage` 解包 text，再交给 EmojiRenderer，显示文字和本地 PNG。转发继续使用未替换的 displayContent 重建 TEXT JSON，保留原始 Token。引用摘要、会话/草稿预览、通知、搜索结果摘要和复制使用 `[表情]`，不会写入本地路径、Base64 或图片消息。

发送行为沿用既有乐观发送：提交后清空草稿；服务端确认失败时原消息保留为 FAILED，可用原 clientMsgId 重试，Emoji Token 保留在原 payload 中。

## 4. 性能与资源检查

- manifest 736 项，PNG 736 张，全部验证为 160×160。ID、file、order 唯一，分类合法、文件路径存在且不越界；目录、文件集合及分类计数与 manifest 一致。
- 分类数量：smile 129、symbol 260、activity 78、flag 269。
- 保持原 ID 空缺，未重编号；`builtin_emoji_0674` 仍不存在，new 中的 `builtin_emoji_3841` 已删除，flag 中的 `builtin_emoji_3833` 保留。
- 虚拟网格用于所有分类，真实 UI 回归测得 flag 快速跨区滚动时同时存在 85～128 个表情按钮；单元测试仍用 2319 个合成数据验证大列表。
- 图片均配置 lazy/async/draggable=false；关闭的空编辑器不请求 manifest 或 PNG。只有打开面板、出现 token 才按需加载 catalog/图片。
- 多个 Renderer、Composer 和反复开关 Picker 共享 **1 次 manifest 加载**。
- 反复开关后 ResizeObserver 关闭时为 0、打开时为 1；切换会话后 Composer 的 selectionchange 监听器始终为 1。
- 生产 Chat 集成测试确认 Picker/recent 更新前后的原消息 HTMLElement 是同一对象。
- 本次软件渲染的离屏测试中，flag 快速跳滚的帧间隔 P95 为 18ms；它包含下一帧等待及图片解码，不能等同于真实显卡环境的 FPS 测量。未做持续数小时堆内存 soak 测试。

## 5. 实际测试结果

| 命令 | 结果 |
| --- | --- |
| `npm run verify` | 成功。含 renderer build、Electron tsc、Vitest；39 个文件、355 项测试全部通过。 |
| `npm run validate:emoji` | 成功。736 项及 736 PNG 的完整资源校验。 |
| `node scripts/validate-emoji-assets.mjs dist/emoji/builtin` | 成功。dist 资源也完整。 |
| `npm run test:emoji-ui -- --packaged` | 成功。73 项真实 Electron 39.8.10 / Chromium / Vue 检查，使用精简后的 app.asar 内资源；覆盖直接打开 Emoji、历史贴纸占位及关闭重发入口。 |
| `npm run test:emoji-ui -- --dev` | 首次完整接入时通过 67 项；本次资源精简未重复运行 HTTP 回归。 |
| `node scripts/test-context-menu-ui.mjs` | 首次完整接入时通过 33 项；本次资源精简未重复运行独立菜单回归。 |
| `git diff --check` | 成功。 |

Vitest 覆盖文本/单个/连续/混排/未知/非法/不完整 Token、parse/serialize 往返、纯表情尺寸、recent 去重/上限/过滤、catalog 缓存/并发/失败、URL 和虚拟网格，以及消息协议的保留。后续删除功能补充检查：删除项的 Token 往返、最近记录过滤、已删除分类路径拒绝、历史内置/自定义/损坏贴纸消息的占位及预览、失败旧贴纸禁止重发。

真实 Chromium 检查 DOM 序列化/还原、中间位置和连续插入、Backspace/Delete、撤销/重做、原生文本输入与退格、剪贴板纯文本、IME 组合事件、两种发送快捷键、图片失败、manifest 失败、所有分类数据、滚动、监听器释放、file URL 解码。

另外直接挂载生产 Chat.vue，仅 HTTP/WebSocket/原生边界替换为内存 fixture，验证真实发送链路的 TEXT JSON、@ 提及、引用、复制、附件粘贴/删除、切换草稿、面板关闭和消息 DOM 稳定。不会登录真实账号、访问真实服务或发送真实消息。

本次验证日志/结果与截图生成在 `.cache/emoji-verify.log`、`.cache/emoji-desktop-build.log`、`.cache/emoji-ui-packaged.log`、`.cache/emoji-ui/results-packaged.json`、`.cache/emoji-ui/emoji-chat-packaged.png`、`.cache/emoji-ui/emoji-packaged-light.png` 和 `.cache/emoji-ui/emoji-packaged-dark.png`。这些都是本地验证产物，不进入安装包。

## 6. Build 与安装包

`npm run build:renderer` 已成功。最终构建目录 `dist/emoji/builtin/` 包含精简后的 manifest 和 736 张 PNG。

原样 `npm run build:desktop` 在本机 npm 11.16.0 下失败，原因是 `npm list --all --json --long` 退出 1 且无 JSON，导致 electron-builder 报 `No JSON content found in output`。使用临时 npm 10 后，又遇到 GitHub Electron 下载连接超时。这些均为实际发生的环境问题。

随后仅在 `.cache/emoji-build-tools` 安装临时 npm 10.9.4，并使用项目已经安装的同版本 Electron 39.8.10，执行以下构建成功：

```powershell
# 在 app/im-web 中执行；不修改系统 npm 或项目依赖。
$env:PATH = (Join-Path (Get-Location) '.cache/emoji-build-tools/node_modules/.bin') + ';' + $env:PATH
$env:npm_config_cache = Join-Path (Get-Location) '.cache/npm'
& .\.cache\emoji-build-tools\node_modules\.bin\npm.cmd run build:desktop -- --config.electronDist=node_modules/electron/dist
```

生成：`release/ArtTalk-Setup-0.0.22-x64.exe`、blockmap、`release/win-unpacked/`。

已检查实际 `release/win-unpacked/resources/app.asar`：manifest 及全部 736 PNG 与源文件逐字节一致，每张均为 160×160；六个已删除分类的路径均不存在。Electron 回归把资源 base 指向 app.asar 内 dist，实际读取 manifest 并解码显示其中 PNG。

移除大表情后重新生成安装包，确认包内渲染器 JS/CSS 与最新 dist 一致，旧“大表情/我的表情”界面、IndexedDB 模块和贴纸网格样式已不在构建产物中，旧贴纸资源目录也不存在。

未修改 appId、productName、artifactName、更新配置、证书或 extraResources；未安装或发布生成的安装包。

## 7. 剩余风险与验证边界

- Selection：真实 Chromium 原生键盘输入/退格及 DOM Range 已验证；系统辅助输入设备和不同 Electron 大版本未覆盖。
- 中文 IME：已验证 compositionstart/end、isComposing、229 确认键不会触发发送。没有人工调用本机微软拼音/搜狗候选窗完成端到端输入，建议发布前用实际输入法抽查。
- file URL：已在沙箱 renderer、实际生产 preload 和打包 app.asar 资源上验证；本次未安装 NSIS 后用两个真实账号联调。
- 滚动：有明确 DOM 上限和重复打开关闭监听器验证。低性能设备 GPU 流畅度和长时间堆内存表现仍需部署环境观察。
- 草稿：原有持久化单测和会话隔离回归通过。生产 Chat 集成的磁盘边界为内存 mock；实际磁盘持久化继续沿用已有 Electron 草稿实现。
- 构建环境：本机默认 npm 11 的 long JSON 故障仍在；上述临时 npm 10 命令可复现本次成功构建，未擅自更改全局工具链。

测试使用的 Electron 窗口与 Vite 服务均在运行结束关闭，没有保留验证服务。
