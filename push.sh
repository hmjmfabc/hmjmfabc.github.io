#!/data/data/com.termux/files/usr/bin/bash
# 一键推送到 GitHub（配合 DEPLOY.md 使用）
#
# 用法：
#   ./push.sh                       # 推送到默认仓库 hmjmfabc/hmjmfabc.github.io
#   REPO_URL=git@github.com:hmjmfabc/hmjmfabc.github.io.git ./push.sh
#
# 首次推送需要身份验证：
#   HTTPS：用户名填 hmjmfabc，密码处粘贴 Personal Access Token（需 Contents 读写权限）
#   SSH  ：先在 GitHub 添加本机公钥

set -euo pipefail
cd "$(dirname "$0")"

REPO_URL="${REPO_URL:-https://github.com/hmjmfabc/hmjmfabc.github.io.git}"
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
set +e
lsr_output="$(git ls-remote origin 2>&1)"
lsr_code=$?
set -e
# git ls-remote 的退出码：0=正常（有分支）、2=仓库为空（同样算连通）、其它=失败
if [ "$lsr_code" -ne 0 ] && [ "$lsr_code" -ne 2 ]; then
  echo "$lsr_output" | head -5
  cat <<'EOF'
❌ 无法访问远端仓库，常见原因：
   1. 仓库还没创建 —— 打开 https://github.com/new 新建名为 hmjmfabc.github.io 的公开仓库
   2. 账号还没注册 —— 打开 https://github.com/signup 注册用户名 hmjmfabc
   3. 未完成身份验证 —— HTTPS 需在密码处粘贴 Personal Access Token
      （生成地址：https://github.com/settings/tokens，权限选 Contents: Read and write）
   4. 本地网络访问 GitHub 受限 —— 换个网络或使用代理后重试
详见 DEPLOY.md
EOF
  exit 1
fi
if [ -z "$(echo "$lsr_output" | tr -d '[:space:]')" ]; then
  echo "  远端仓库当前为空（首次推送）"
else
  echo "  远端可访问，已有分支："
  echo "$lsr_output" | sed 's/^/    /' | head -5
fi

echo "→ 推送代码"
# 部分网络下 HTTP/2 容易被中断，这里固定使用 HTTP/1.1 提升成功率
if ! git -c http.version=HTTP/1.1 push -u origin "$BRANCH"; then
  cat <<'EOF'

❌ 推送失败。若提示需要用户名/密码：
   用户名填 hmjmfabc，密码处粘贴 Personal Access Token
   （生成地址：https://github.com/settings/tokens，权限选 Contents: Read and write）

想让本机记住令牌、以后不用重复输入，可先执行一次：
   git config --global credential.helper store

然后重新运行 ./push.sh
EOF
  exit 1
fi

cat <<'EOF'

✅ 推送完成！接下来还有两步（在浏览器里操作）：

1. 仓库 → Settings → Pages → Source 选择「GitHub Actions」
   然后到 Actions 标签等「部署到 GitHub Pages」工作流跑完（约 1 分钟）

2. 到 swordsman.top 的 DNS 服务商添加解析记录：
      类型 CNAME   主机记录 status   记录值 hmjmfabc.github.io
   回到 Settings → Pages 填写 Custom domain：status.swordsman.top
   DNS 生效后勾选 Enforce HTTPS

详细说明见 DEPLOY.md
EOF
