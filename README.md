# SGU 剑客群组服 状态监测

一个前后端一体、**零第三方依赖**的 Minecraft 服务器状态监测网站，界面参照工作区中的
`MCJPG 状态监测.mht`（Uptime Kuma 状态页）风格编写。

- 标题：**SGU 剑客群组服 状态监测**
- 标题 Logo：`logo.png`（原始 992×992 / 909 KB → 压缩后 192×192 / 约 60 KB，另生成 64×64 favicon）
- 监测 3 台服务器，每台分为 **IPv4 / IPv6** 两个部分，并在下方附该服的玩家交流群入口
- 页面**不展示任何 IP / 域名 / SRV 解析信息**，MOTD 按服务端配色**彩色显示**
- 状态 5 分钟自动刷新一次，页脚三行居中显示：版权、最后刷新时间、下次刷新倒计时
- 页脚版权：`Copyright © 剑客群组服 2024～2026`（浅色模式纯黑、字号稍大）
- 支持**深色模式**，切换按钮固定在页面最右上角，选择会被记住

## 快速开始

```bash
cd /data/data/com.termux/files/home/Web
node server.js              # 前台启动，默认 http://127.0.0.1:8787/
# 或
./start.sh                  # 后台启动，日志写入 logs/server.log
./start.sh status           # 查看状态
./start.sh stop             # 停止
```

浏览器打开 <http://127.0.0.1:8787/> 即可查看。

> 线上部署（GitHub Pages + status.swordsman.top）请看 **[DEPLOY.md](DEPLOY.md)**。
> Pages 无法运行 Node 后端，因此线上版本由浏览器直连探测（DoH + 公开状态接口），
> IPv4 / IPv6 均可正常检测；本地 Node 后端仍然保留，前端会自动优先使用它。

可用环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址；设为 `0.0.0.0` 可供局域网访问 |
| `DEBUG` | 未设置 | 设为任意值可输出每次检查的耗时日志 |

## 监测目标

| 服务器 | IPv4（SRV 解析） | IPv6 |
| --- | --- | --- |
| 主服务器 | `mc.swordsman.top` | `ipv6.swordsman.top:25565` |
| 术友汇 | `39miku.swordsman.top` | `ipv6.swordsman.top:39831` |
| 圣苦力怕帝国 | `neohce.swordsman.top` | `ipv6.swordsman.top:10037` |

### IPv4：SRV 解析

三个 IPv4 入口均为 SRV 解析：先查询 `_minecraft._tcp.<域名>`，取得目标主机与端口后再建立
TCP 连接；**Handshake 包中仍写入原始域名**，以保证 BungeeCord / Velocity 的 forced-host
匹配不出错。

若 SRV 记录不存在，程序会自动降级为「A 记录 + 25565 端口」直连，并在页面上标注
`（无 SRV 记录，回退）`；若两者都不存在，则该入口显示为离线，并给出具体原因
（例如 `域名解析失败：SRV 记录不可用（无此 DNS 记录）`）。

> 当前实测：`neohce.swordsman.top` 的 SRV 与 A 记录均尚未生效（NXDOMAIN），
> 因此「圣苦力怕帝国」的 IPv4 入口显示为离线、整机状态为黄色；记录生效后会自动恢复绿色，
> 无需修改任何代码。

### IPv6

IPv6 入口直接解析 `ipv6.swordsman.top` 的 AAAA 记录，并**强制使用 IPv6 连接**，端口分别为
`25565` / `39831` / `10037`。

## 页面展示规则

| 区域 | 内容 |
| --- | --- |
| 每个服务器卡片 | 第一栏 IPv4、第二栏 IPv6、第三栏该服玩家交流群（跳转 QQ 群分享链接） |
| 线路标识 | 仅显示 `IPv4` / `IPv6` 徽章与「在线 / 离线」，**不显示 IP、域名与 SRV 解析链路** |
| 在线信息 | 延迟、服务端版本、在线人数 / 上限 |
| MOTD | 按服务端配色分段渲染（支持聊天组件 `color`、§ 传统颜色与 `§x` 十六进制色），背景跟随主题（浅色为卡片白、深色为卡片黑），保留服务端原始配色 |
| 心跳条 | 最近 24 次（2 小时）检查记录，绿=在线、红=离线，鼠标悬停显示时间与延迟 |
| 页脚（三行居中） | ① `Copyright © 剑客群组服 2024～2026`（浅色模式纯黑、17px；深色模式纯白）② `最后更新于 YYYY-MM-DD HH:mm:ss` ③ `将于 mm:ss 后刷新` |
| 主题 | 右上角固定按钮切换深色 / 浅色；首次访问跟随系统偏好，选择记录在 `localStorage`（键名 `sgu-theme`），首屏脚本在绘制前应用，无闪白；浏览器地址栏配色随主题切换 |

> 说明：接口 `/api/status` 中仍保留 `host` / `note` 等解析信息字段，便于排查问题，但前端不会渲染；
> 页面与渲染结果中不出现任何域名或 IP 地址（已由 `tools/smoke-test.js` 自动校验）。

## 状态判定规则

| 状态 | 颜色 | 条件 |
| --- | --- | --- |
| 全部在线 | 绿色 | 该服务器 IPv4、IPv6 **全部**在线 |
| 部分在线 | 黄色 | IPv4、IPv6 **只要有一个**不在线 |
| 全部掉线 | 红色 | IPv4、IPv6 **全部**不在线 |

顶部总览条按同样规则汇总三台服务器：全部绿色为「所有服务运行正常」，全部红色为
「所有服务均不可用」，其余为「部分服务出现异常」。

## 探测原理

使用 Minecraft Java 版 **Server List Ping (SLP)** 协议（`lib/mcping.js`，纯手写 VarInt
编解码），可获取：

- 在线状态与连接延迟（TCP 握手 + Ping/Pong 往返）
- 服务端版本、协议号
- 在线人数 / 最大人数
- MOTD（兼容字符串、聊天组件对象与 `§` 传统颜色代码）
- 服务器图标（favicon，经 `/api/icon/:id` 单独按需下发，不进入状态 JSON）

## 接口

| 路径 | 说明 |
| --- | --- |
| `GET /api/status` | 完整状态快照（含历史心跳记录） |
| `GET /api/status?refresh=1` | 强制立即重新探测（10 秒内重复请求会被节流） |
| `GET /api/servers` | 监测目标配置 |
| `GET /api/icon/:endpointId` | 服务器图标 PNG |
| `GET /api/health` | 服务自身健康检查（含内存占用） |

## 目录结构

```
Web/
├── server.js              # HTTP 服务：静态资源 + API（本地/自建后端）
├── lib/
│   ├── servers.js         # 站点信息与监测目标配置（唯一数据源）
│   ├── monitor.js         # DNS(SRV/AAAA) 解析、探测调度、状态聚合、历史记录
│   └── mcping.js          # Minecraft Server List Ping 协议实现
├── public/                # 前端（原生 HTML/CSS/JS，无框架、无 CDN）
│   ├── index.html
│   ├── style.css
│   ├── app.js             # 渲染 + 主题切换 + 5 分钟倒计时自动刷新
│   ├── probe.js           # 静态模式：浏览器直连探测（DoH + 公开状态接口）
│   ├── motd.js            # MOTD 彩色解析（前后端共用）
│   ├── config.js          # 由 lib/servers.js 自动生成
│   ├── logo.png           # 压缩后的标题 Logo（192×192）
│   ├── favicon.png
│   ├── CNAME              # GitHub Pages 自定义域名
│   └── .nojekyll
├── tools/
│   ├── resize-logo.js     # 纯 Node PNG 缩放/压缩工具（无第三方依赖）
│   ├── build-config.js    # 由 lib/servers.js 生成 public/config.js
│   ├── build-site.js      # 构建 GitHub Pages 静态产物（--out=docs|dist）
│   ├── smoke-test.js      # 本地后端模式端到端自检
│   └── static-test.js     # 模拟 Pages 环境（无后端）自检
├── docs/                  # GitHub Pages 发布目录（由 public/ 构建生成）
├── .github/workflows/pages.yml  # 备选：用 GitHub Actions 发布
├── deploy.sh              # 一条命令：构建 docs/ → 提交 → 推送
├── push.sh                # 仅推送（首次推送用）
├── DEPLOY.md              # 部署步骤（含需要你手动操作的部分）
├── data/history.json      # 最近 24 次（2 小时）检查历史，重启后仍保留
├── start.sh               # 后台启动 / 停止 / 状态脚本
└── logo.png               # 原始 Logo（992×992）
```

## 自检

```bash
node tools/smoke-test.js        # 本地后端模式（服务需已启动）
node tools/static-test.js       # 静态模式（模拟 GitHub Pages，无需后端）
```

会依次校验接口结构、状态聚合规则（绿 / 黄 / 红）、前端渲染结果、
以及「页面不出现任何域名与 IP」「MOTD 彩色渲染」「三个交流群入口」「页脚三行样式」等要求，
全部通过时退出码为 0。

## 刷新与缓存策略

- **前端**：每 5 分钟自动刷新一次；倒计时对齐服务端整点（`:00 / :05 / :10 …`）。
  页面切回前台时若已过刷新时刻，会立即刷新。
- **后端**：快照缓存 60 秒，避免重复探测；后台定时任务同样对齐 5 分钟整点执行，
  因此无人访问时状态依旧保持最新。
- **DNS**：SRV / A / AAAA 记录缓存 60 秒。
- **超时**：单个入口连接超时 5 秒，全量检查硬超时 12 秒（异常时也能返回结果）。

## 资源占用

实测（Termux / Node.js v26）：常驻内存约 **45～60 MB**，远低于 3500 MB 上限；
无第三方依赖，不需要 `npm install`，磁盘占用约 1 MB（不含原始 logo）。
探测以 5 分钟为周期，每次仅建立 6 条短连接，CPU 占用可忽略。

## 自定义

- 改站点标题 / 版权 / 描述：`lib/servers.js` 的 `site` 字段（前端页面标题在
  `public/index.html` 中同步修改）。
- 增删服务器或端口：`lib/servers.js` 的 `servers` 数组。
- 重新压缩 Logo：`node tools/resize-logo.js logo.png public/logo.png 192`
  （第 4 个参数为输出边长，脚本会自动去除 alpha 通道并按最小绝对差选择 PNG 滤波，压缩率约 93%）。
