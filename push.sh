#!/data/data/com.termux/files/usr/bin/bash
# 一键推送到 GitHub（配合 DEPLOY.md 使用）
#
# 用法：
#   ./push.sh                       # 推送到默认仓库 sgustatus/sgustatus.github.io
#   REPO_URL=git@github.com:sgustatus/sgustatus.github.io.git ./push.sh
#
# 首次推送需要身份验证：
#   HTTPS：用户名填 sgustatus，密码处粘贴 Personal Access Token（需 Contents 读写权限）
#   SSH  ：先在 GitHub 添加本机公钥

set -euo pipefail
cd "$(dirname "$0")"

REPO_URL="${REPO_URL:-https://github.com/sgustatus/sgustatus.github.io.git}"
BRANCH="main"

echo "仓库地址：$REPO_URL"
echo "当前分支：$(git branch --show-current)"
echo "待推送提交："
git log --oneline -3
echo

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "→ 添加远端 origin"
  git remote add origin "$REPO_URL"
else
  current="$(git remote get-url origin)"
  if [ "$current" != "$REPO_URL" ]; then
    echo "→ 更新远端 origin：$current → $REPO_URL"
    git remote set-url origin "$REPO_URL"
  fi
fi

echo "→ 检查远端是否可访问…"
if ! git ls-remote --exit-code origin >/dev/null 2>&1; then
  cat <<'EOF'
❌ 无法访问远端仓库，常见原因：
   1. 仓库还没创建 —— 打开 https://github.com/new 新建名为 sgustatus.github.io 的公开仓库
   2. 账号还没注册 —— 打开 https://github.com/signup 注册用户名 sgustatus
   3. 未完成身份验证 —— HTTPS 需在密码处粘贴 Personal Access Token
      （生成地址：https://github.com/settings/tokens，权限选 Contents: Read and write）
   4. 本地网络无法访问 GitHub —— 可尝试切换网络或稍后重试
详见 DEPLOY.md
EOF
  exit 1
fi

echo "→ 推送代码"
git push -u origin "$BRANCH"

cat <<'EOF'

✅ 推送完成！接下来还有两步（在浏览器里操作）：

1. 仓库 → Settings → Pages → Source 选择「GitHub Actions」
   然后到 Actions 标签等「部署到 GitHub Pages」工作流跑完（约 1 分钟）

2. 到 swordsman.top 的 DNS 服务商添加解析记录：
      类型 CNAME   主机记录 status   记录值 sgustatus.github.io
   回到 Settings → Pages 填写 Custom domain：status.swordsman.top
   DNS 生效后勾选 Enforce HTTPS

详细说明见 DEPLOY.md
EOF
