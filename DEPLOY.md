# 部署说明（GitHub Pages）

目标：把本站部署到 GitHub Pages，通过自定义域名 **https://status.swordsman.top** 访问。

- GitHub 账号 / 仓库：`sgustatus/sgustatus.github.io`（用户主页仓库，Pages 默认地址为 `sgustatus.github.io`）
- 自定义域名：`status.swordsman.top`
- 部署方式：GitHub Actions（`.github/workflows/pages.yml`）把 `public/` 构建成静态站点后发布

> **重要前提**：GitHub Pages 只能托管静态文件、无法运行 Node 后端。
> 因此线上版本使用**浏览器直连探测**：由访客的浏览器完成
> DoH 解析（阿里云公共 DNS，支持 SRV）+ 调用公开的 Minecraft 状态接口（mcsrvstat.us）。
> 实测 IPv4 与 IPv6 均能正确探测，结果与本机 Node 后端一致。
> 仓库里的 Node 后端仍然保留，可继续在本机运行（`node server.js`），前端会自动优先使用它。

---

## 一、需要你手动完成的步骤

### 1. 注册 GitHub 账号并建仓库

1. 打开 <https://github.com/signup> 注册账号，用户名必须是 **`sgustatus`**（与页面默认域名对应）。
2. 登录后打开 <https://github.com/new> 新建仓库：
   - **Repository name**：`sgustatus.github.io`
   - **Public**（必须是公开仓库，Pages 才能免费用）
   - **不要**勾选 Add a README file / .gitignore / license（保持空仓库，避免推送冲突）
3. 建好后把仓库地址发我，或直接执行下面的推送步骤。

### 2. 推送代码（本机执行）

仓库我已经初始化并提交好了，你只需要：

```bash
cd /data/data/com.termux/files/home/Web
git remote add origin https://github.com/sgustatus/sgustatus.github.io.git
git branch -M main
git push -u origin main
```

首次推送会要求身份验证，二选一：

- **HTTPS + 令牌（推荐）**：在 <https://github.com/settings/tokens> 生成
  Fine-grained token（权限：`Contents: Read and write`），推送时用户名填 `sgustatus`，
  密码处粘贴令牌。
- **SSH**：把 `git remote add origin` 换成
  `git remote add origin git@github.com:sgustatus/sgustatus.github.io.git`，
  并先在 <https://github.com/settings/keys> 添加本机 SSH 公钥。

### 3. 开启 Pages

仓库页面 → **Settings → Pages**：

- **Source** 选择 **GitHub Actions**（不要选 Deploy from a branch）
- 保存后回到 **Actions** 标签，等 “部署到 GitHub Pages” 这个工作流跑完（约 1 分钟）

### 4. 绑定自定义域名 + DNS 解析

**GitHub 侧**：Settings → Pages → **Custom domain** 填 `status.swordsman.top` → Save
（仓库里已带 `CNAME` 文件，通常会自动填好）。

**DNS 侧**（到 swordsman.top 的域名服务商处添加一条记录）：

| 类型 | 主机记录 | 记录值 | TTL |
| --- | --- | --- | --- |
| CNAME | `status` | `sgustatus.github.io` | 600（或默认） |

> 注意：记录值结尾**不要**加点，也不要填成 `https://…`。
> 如果服务商要求 CNAME 指向带点的形式，填 `sgustatus.github.io.` 也可以。

**启用 HTTPS**：DNS 生效后（通常几分钟到 1 小时），回到 Settings → Pages，
勾选 **Enforce HTTPS**。GitHub 会自动为 `status.swordsman.top` 签发证书。

### 5. 验证

```bash
curl -I https://status.swordsman.top
curl -s https://status.swordsman.top/CNAME      # 应输出 status.swordsman.top
```

浏览器打开 <https://status.swordsman.top>，页面应显示三台服务器状态、
每台下方有 IPv4 / IPv6 两条线路与一个交流群卡片。

---

## 二、以后如何更新

改完代码后：

```bash
cd /data/data/com.termux/files/home/Web
git add -A
git commit -m "更新说明"
git push
```

推送后 Actions 会自动重新构建并发布（约 1 分钟）。资源带版本号，
访客刷新即可看到最新版本。

如果改动了服务器列表 / 端口（`lib/servers.js`），构建时会自动重新生成
前端配置 `public/config.js`，无需手工同步。

---

## 三、本地预览与自检

```bash
node server.js                 # 本地完整版（含 Node 后端），http://127.0.0.1:8787/
node tools/build-site.js       # 构建静态产物到 dist/
node tools/static-test.js      # 模拟 Pages 环境，验证「无后端也能出结果」
node tools/smoke-test.js       # 本地后端模式的完整自检
```

用任意静态服务器预览 dist/ 即可模拟线上效果：

```bash
cd dist && python3 -m http.server 8080
```

---

## 四、常见问题

**Q：为什么线上版本没有“延迟 xx ms”？**
A：延迟需要真实建立 TCP 连接才能测得，浏览器无法做到；静态模式下由第三方节点探测，
因此不显示延迟，其余信息（在线状态、版本、人数、彩色 MOTD、服务器图标）都完整。

**Q：第三方接口挂了怎么办？**
A：前端按顺序尝试 `mcsrvstat.us` → `mcstatus.io`；若都不可用，页面顶部会提示
「无法获取服务器状态，将在 30 秒后重试」，不会误报为离线。

**Q：想让线上也精确测量延迟 / 完全自主可控？**
A：把前端配置 `public/config.js` 里的 `mode` 改成 `server`，
并把 `apiBase` 填成你自己后端的公网地址（需要 HTTPS 且已开启 CORS）。
本仓库的 Node 后端默认已带 `Access-Control-Allow-Origin: *`。
