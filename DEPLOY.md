# 部署说明（GitHub Pages）

目标：把本站部署到 GitHub Pages，通过自定义域名 **https://status.swordsman.top** 访问。

- GitHub 账号 / 仓库：`hmjmfabc/hmjmfabc.github.io`
- 正式访问地址：**https://status.yunmc.icu/** （Pages 已配置的自定义域名，`hmjmfabc.github.io` 会跳转到它）
- 发布方式：**GitHub Actions**（`.github/workflows/pages.yml`，构建 `dist/` 后发布；已实测成功）
- `docs/` 目录：同样的静态产物，作为「Deploy from a branch → main /docs」的备用方案，当前未被使用

> **重要前提**：GitHub Pages 只能托管静态文件、无法运行 Node 后端。
> 因此线上版本使用**浏览器直连探测**：由访客的浏览器完成
> DoH 解析（阿里云公共 DNS，支持 SRV）+ 调用公开的 Minecraft 状态接口（mcsrvstat.us）。
> 实测 IPv4 与 IPv6 均能正确探测，结果与本机 Node 后端一致。
> 仓库里的 Node 后端仍然保留，可继续在本机运行（`node server.js`），前端会自动优先使用它。

---

## 一、当前部署状态（已核实）

| 项目 | 状态 |
| --- | --- |
| 代码推送 | ✅ 已同步 `main` 分支 |
| Pages 构建方式 | ✅ GitHub Actions（构建类型 `workflow`，最近几次运行均为 success） |
| 自定义域名 | ✅ `status.yunmc.icu`，DNS 已解析到 GitHub Pages，站点可访问 |
| HTTPS | ✅ 已启用（`https://status.yunmc.icu/` 正常返回 200） |
| `status.swordsman.top` | ⛔ 无法使用：该域名已被另一个 GitHub 账号（`mingyu-games-wmjbfs`）通过 TXT 记录完成**域名验证**，GitHub 规定「验证域名后其**所有一级子域**都归属该账号」，因此本账号添加时会提示“域名属于其他用户”。详见文末说明。 |

### 当前发布流程（无需再手动操作）

代码推送到 `main` 后，GitHub Actions 会自动执行：

1. `node tools/build-site.js --version=<commit sha>` —— 由 `lib/servers.js` 重新生成 `public/config.js`，
   把 `public/` 复制到 `dist/`，并给资源加上版本号（避免浏览器缓存旧文件）
2. 写入 `dist/CNAME`（`status.yunmc.icu`）与 `dist/.nojekyll`
3. 上传 artifact 并发布到 GitHub Pages

可在仓库 **Actions** 标签查看「部署到 GitHub Pages」的运行记录，或访问
<https://status.yunmc.icu/> 验证。

## 二、需要你做的第 2 件事：DNS 与自定义域名

**DNS 侧**（到 swordsman.top 的域名服务商处添加一条记录）：

| 类型 | 主机记录 | 记录值 | TTL |
| --- | --- | --- | --- |
| CNAME | `status` | `hmjmfabc.github.io` | 600（或默认） |

> 记录值结尾**不要**加点，也不要填成 `https://…`。
> 如果服务商要求带点的形式，填 `hmjmfabc.github.io.` 也可以。

**GitHub 侧**：Settings → Pages → **Custom domain** 填 `status.swordsman.top` → **Save**
（`docs/CNAME` 里已写好该域名，通常会自动填好）。

**启用 HTTPS**：DNS 生效后（通常几分钟到 1 小时），回到 Settings → Pages
勾选 **Enforce HTTPS**，GitHub 会自动签发证书。

### 验证

```bash
curl -I https://status.swordsman.top
curl -s https://status.swordsman.top/CNAME      # 应输出 status.swordsman.top
```

---

## 三、以后如何更新

**推荐：一条命令搞定**（自动构建 `docs/` → 提交 → 推送）

```bash
cd /data/data/com.termux/files/home/Web
./deploy.sh "这次改了什么"
```

只想构建并提交、暂不发布：`./deploy.sh --no-push`

**手动等价步骤**

```bash
cd /data/data/com.termux/files/home/Web
node tools/build-site.js --out=docs      # ① 重新构建发布目录
git add -A && git commit -m "更新说明"    # ② 提交
git push                                  # ③ 推送
```

推送后 GitHub Pages 会在 1 分钟内自动重新发布。若改动了服务器列表 / 端口
（`lib/servers.js`），构建时会自动重新生成前端配置 `public/config.js`，无需手工同步。

> 第一次推送需要身份验证：**Username 填 `hmjmfabc`**，**Password 处粘贴
> Personal Access Token**（<https://github.com/settings/tokens>，权限 `Contents: Read and write`）。
> 想以后免输入：`git config --global credential.helper store`

---

## 四、备选方案：用 GitHub Actions 发布

仓库里同时保留了 Actions 工作流 `.github/workflows/pages.yml`
（构建到 `dist/`，不往仓库里提交产物）。若你更喜欢这种方式：

1. Settings → Pages → **Source 改成 `GitHub Actions`**
2. 到 **Actions** 标签，选「部署到 GitHub Pages」→ **Re-run all jobs**（或再推一次代码）

两种方式二选一即可，不要同时使用。

---

## 五、本地预览与自检

```bash
node server.js                        # 本地完整版（含 Node 后端），http://127.0.0.1:8787/
node tools/build-site.js              # 构建静态产物到 dist/（Actions 用）
node tools/build-site.js --out=docs   # 构建静态产物到 docs/（分支部署用）
node tools/static-test.js             # 模拟 Pages 环境，验证「无后端也能出结果」
node tools/smoke-test.js              # 本地后端模式的完整自检
```

用任意静态服务器预览 `docs/` 即可模拟线上效果：

```bash
cd docs && python3 -m http.server 8080
```

---

## 六、常见问题

**Q：访问站点看到的是 README 内容？**
A：Pages 发布目录还是 `/ (root)`，按本文第一节改成 `/docs` 即可。

**Q：为什么线上版本没有“延迟 xx ms”？**
A：延迟需要真实建立 TCP 连接才能测得，浏览器无法做到；静态模式下由第三方节点探测，
因此不显示延迟，其余信息（在线状态、版本、人数、彩色 MOTD、服务器图标）都完整。

**Q：第三方接口挂了怎么办？**
A：前端按顺序尝试 `mcsrvstat.us` → `mcstatus.io`；若都不可用，页面顶部会提示
「无法获取服务器状态，将在 30 秒后重试」，不会误报为离线。

**Q：本地版为什么把 IPv6 显示成「未验证」？**
A：说明运行后端的那台设备当前没有 IPv6 网络（`ip -6 addr` 为空即为这种情况），
此时无法验证 IPv6 线路，程序会标记为「未验证」而不是误报「离线」，
页面顶部也会给出提示。恢复 IPv6 后自动转为正常检测。
线上静态版不受影响（探测在第三方节点完成）。

**Q：想让线上也精确测量延迟 / 完全自主可控？**
A：把前端配置 `public/config.js` 里的 `mode` 改成 `server`，
并把 `apiBase` 填成你自己后端的公网地址（需要 HTTPS 且已开启 CORS）。
本仓库的 Node 后端默认已带 `Access-Control-Allow-Origin: *`。

---

## 关于 status.swordsman.top

`swordsman.top` 目前由另一个 GitHub 账号 `mingyu-games-wmjbfs` 使用：
根域名解析到 `mingyu-games-wmjbfs.github.io`，且 DNS 中存在验证记录

```
_github-pages-challenge-mingyu-games-wmjbfs.swordsman.top  TXT  ae1fdf3183d1f4323c116d73d5d7fc
```

按 GitHub 官方文档（[Verifying your custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)）：

- 域名验证后，**只有该账号名下的仓库**可以把 Pages 站点发布到该域名**及其一级子域**；
- 若要验证一个「已被其他用户验证过的域名」，释放流程**不会成功**。

因此 `status.swordsman.top` 无法在本账号下使用。可选方案：

1. **继续用 `status.yunmc.icu`**（当前方案，已可用）；
2. 若 `mingyu-games-wmjbfs` 也是你们自己的账号：直接把本站部署到那个账号下，
   或在那个账号的 Settings → Pages 里移除已验证域名后，再由本账号重新验证；
3. 换一个未被验证的域名。
