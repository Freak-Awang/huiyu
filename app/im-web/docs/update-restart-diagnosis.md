**更新后未自动启动：本机排查结果**

用户现象：从约 0.0.14 更新到 0.0.15，点击立即重启后窗口关闭，新版未打开。

**已确认的直接原因**

本机实际安装的是 C:\Program Files\ArtTalk 下的 0.0.14。读取其 resources/app.asar 中 package.json 和编译后的 updater.js，确认该版本没有 electron-updater，执行的是旧自研安装代码：

```js
const command = `"${installer}" /S && start "" "${process.execPath}"`;
const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
});
child.unref();
void report('install_success');
await rm(stateFilePath(), { force: true }).catch(() => undefined);
setTimeout(() => {
    app.removeAllListeners('window-all-closed');
    app.exit(0);
}, 500);
```

问题链路：

1. Node spawn 对包含引号的命令参数做转义，cmd.exe 最终把带反斜杠引号的路径当作命令名，执行失败。
2. stdio:ignore 隐藏了 cmd 错误；代码没有检查子进程退出码。
3. 它提前上报 install_success、删除待安装状态，并且无论安装命令是否成功，500 毫秒后都会强制退出应用。
4. 因此表现为“窗口关闭、安装没有发生、也没有重新启动”。

**实际复现**

用本机已安装的 ArtTalk.exe 以 ELECTRON_RUN_AS_NODE=1 运行无副作用探针，运行时为 Electron 39.8.10 / Node 22.22.1。只将真实安装器替换为打印标记后结束的脚本，将启动应用替换为 echo，没有运行 NSIS 或安装应用。

| 实验 | 结果 |
| --- | --- |
| 0.0.14 原 spawn 参数 | exit code=1，安装器探针未执行；stderr 报带转义引号的路径“不是内部或外部命令”。 |
| 仅修正诊断命令的引号传递作为对照 | exit code=0，输出 INSTALLER_PROBE_REACHED。 |

对照仅用于证明原因，不建议在产品中恢复自研 cmd 更新链路。

**同时确认的包版本混淆**

| 对象 | 版本/内容 | 字节数 | 时间 |
| --- | --- | --- | --- |
| 本机 C:\Program Files\ArtTalk\resources\app.asar | 0.0.14，无 electron-updater | 27,279,838 | 2026-09-10 14:40:50 |
| 本机 updates 缓存中的 ArtTalk-Setup-0.0.15-x64.exe | 0.0.15，无 electron-updater；仍为直接 spawn + 定时退出 | 97,222,188 | 2026-09-10 15:21:06 |
| 项目 release 中上次修改后生成的同名 EXE | 修复后的 0.0.15，包含 electron-updater 6.8.9 | 97,681,510 | 2026-09-10 16:03:38 |

缓存 EXE 的 SHA256：

```text
c8e8063425e570605dd24f8e77bb69ffa1b85a6719fb185806e7a72112d8344c
```

项目新 EXE 的 SHA256：

```text
72acc5d22e0d914250b7ecd40a544922d746c00565d591c31010c1f99a48f436
```

已从缓存 EXE 解出 app.asar 直接确认其内容，不能只凭文件名 0.0.15 判断包含修复。上次交付沿用了已有的 0.0.15 版本号，确实存在同版本不同构建，应在后续交付中消除此歧义。

注册表 DisplayVersion 仍为 0.0.14，卸载项为 /allusers；安装目录未变。排查时没有运行中的 ArtTalk 或 NSIS 安装进程。

**后续处理方向**

旧 0.0.14 的安装命令已经有故障，仅把修复代码放入新包，不会改变旧进程正在执行的安装逻辑。本机需要先通过正确的新包完成一次覆盖安装，使修复后的更新器生效；后续应使用唯一、更高的发布版本，并校验实际下载包的哈希，再测试完整自动升级。

本轮没有修改生产代码、清除用户缓存、改变登录信息、执行安装或发布服务器产物。服务端此刻的发布记录未读取；已确认的是本机缓存仍为旧构建，不能据此断言服务器当前仍在返回旧包。
