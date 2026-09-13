#!/data/data/com.termux/files/usr/bin/bash
# 发布到 mingyu-games-wmjbfs/status-swordsman.github.io
#
# 该仓库属于 mingyu-games-wmjbfs 账号（swordsman.top 的域名验证在该账号下），
# 因此推送需要该账号的权限，或该账号已把 hmjmfabc 加为协作者。
#
# 用法：
#   ./push-sgu.sh                # 构建 + 合并远端初始提交 + 推送
#   ./push-sgu.sh --no-push      # 只构建并提交，不推送
#
# 身份验证：推送时 Username 填有权限的账号名（hmjmfabc 或 mingyu-games-wmjbfs），
#           Password 粘贴对应账号的 Personal Access Token（Contents: Read and write）。

set -euo pipefail
cd "$(dirname "$0")"

REMOTE="sgu"
URL="https://github.com/mingyu-games-wmjbfs/status-swordsman.github.io.git"
BRANCH="main"
DOMAIN="status.swordsman.top"

echo "① 构建静态站点（CNAME = $DOMAIN）"
node tools/build-site.js --out=docs --domain="$DOMAIN" --version="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
node tools/build-site.js --domain="$DOMAIN" --version="$(git rev-parse --short HEAD 2>/dev/null || date +%s)" >/dev/null

echo
echo "② 提交构建产物"
git add -A
if git diff --cached --quiet; then
  echo "  没有需要提交的变更"
else
  git commit -q -m "构建产物同步（$(date '+%Y-%m-%d %H:%M')）"
  git log --oneline -1
fi

if [ "${1:-}" = "--no-push" ]; then
  echo
  echo "已跳过推送（--no-push）"
  exit 0
fi

# 确保远端存在
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "→ 添加远端 $REMOTE"
  git remote add "$REMOTE" "$URL"
elif [ "$(git remote get-url "$REMOTE")" != "$URL" ]; then
  git remote set-url "$REMOTE" "$URL"
fi

echo
echo "③ 尝试拉取远端已有内容（公开仓库，无需凭据；网络不通时自动跳过）"
if git -c http.version=HTTP/1.1 fetch "$REMOTE" "$BRANCH" 2>/dev/null; then
  if ! git merge --no-edit "$REMOTE/$BRANCH" --allow-unrelated-histories >/dev/null 2>&1; then
    echo "  合并远端提交时出现冲突，已放弃合并（将直接推送本地历史）"
    git merge --abort 2>/dev/null || true
    NEED_FORCE=1
  else
    echo "  已合并远端提交"
    NEED_FORCE=0
  fi
else
  echo "  拉取失败（网络问题），跳过"
  NEED_FORCE=1
fi

echo
echo "④ 推送到 $REMOTE（$URL）"
export GIT_TERMINAL_PROMPT=1
push_once() {
  git -c http.version=HTTP/1.1 push "$REMOTE" "HEAD:$BRANCH" 2>&1
}

if push_once; then
  echo
  echo "✅ 推送完成"
else
  echo
  echo "普通推送被拒绝（远端有本地不存在的提交，例如初始的 LICENSE）"
  echo "→ 将改用强制推送覆盖远端历史（远端目前只有初始提交，内容不会丢）"
  if git -c http.version=HTTP/1.1 push --force "$REMOTE" "HEAD:$BRANCH"; then
    echo
    echo "✅ 强制推送完成"
  else
    cat <<'EOF'

❌ 推送失败。常见原因：
   1. 没有该仓库的写权限 —— 需要在 mingyu-games-wmjbfs 账号里把 hmjmfabc 加为
      Settings → Collaborators 协作者，或改用该账号自己的令牌
   2. 令牌无效 / 权限不足 —— 需要 Contents: Read and write
   3. 网络无法访问 GitHub —— 换个网络（或代理）后重试
EOF
    exit 1
  fi
fi

cat <<'EOF'

接下来（在 GitHub 网页上操作）：

1. 仓库 → Settings → Pages → Source 选择「GitHub Actions」
   （或 Deploy from a branch → main → /docs）
2. Custom domain 填 status.swordsman.top 并 Save
   —— 该账号已验证 swordsman.top，因此这一步可以成功
3. 阿里云 DNS 添加记录：CNAME  status  →  mingyu-games-wmjbfs.github.io
4. DNS 生效后勾选 Enforce HTTPS
EOF
