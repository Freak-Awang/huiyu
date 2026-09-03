# 局域网 P2P 文件传输

新建的单聊文件和文件夹使用 Electron WebRTC DataChannel 在客户端之间直传。后端只负责鉴权、附件摘要消息和 SDP/ICE 信令，不接收文件清单或文件正文。图片、头像、更新包和历史 `object_storage` 附件继续使用原文件服务。

## 启用

该能力默认关闭。后端和桌面客户端完成同批发布后，在灰度实例设置：

```text
P2P_FILE_TRANSFER_ENABLED=true
```

可选限制项：

```text
P2P_MAX_FILE_SIZE=2147483648
P2P_MAX_FOLDER_SIZE=21474836480
P2P_MAX_FOLDER_FILES=10000
P2P_MAX_SIGNAL_BYTES=65536
```

启用后，新文件与文件夹没有服务器上传或 TURN 回退。对方必须有支持 P2P v1 的在线 Electron 会话，并且双方需要能通过局域网 host candidate 建立连接。

## 验证

```powershell
cd app/im-web
npm.cmd run verify

cd ../im-backend
mvn.cmd -pl im-server -am test
```

联调时应同时确认 HTTP 上传接口、WebSocket 帧、服务端上传目录和 MinIO 中均没有出现文件正文或新增附件对象。
