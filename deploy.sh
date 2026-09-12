#!/data/data/com.termux/files/usr/bin/bash
# 更新线上站点：重新构建 docs/ → 提交 → 推送
#
# GitHub Pages 当前使用「Deploy from a branch → main / docs」方式发布，
# 所以每次改动都要先构建到 docs/ 再推送。
#
# 用法：
#   ./deploy.sh              # 构建 + 提交 + 推送
#   ./deploy.sh --no-push    # 只构建并提交，不推送

set -euo pipefail
cd "$(dirname "$0")"

echo "① 构建静态站点到 docs/"
node tools/build-site.js --out=docs --version="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

echo
echo "② 提交变更"
git add -A
if git diff --cached --quiet; then
  echo "  没有需要提交的变更"
else
  msg="${1:-更新站点}"
  [ "$msg" = "--no-push" ] && msg="更新站点"
  git commit -q -m "$msg"
  git log --oneline -1
fi

if [ "${1:-}" = "--no-push" ]; then
  echo
  echo "已跳过推送（--no-push）。需要发布时执行：git push"
  exit 0
fi

echo
echo "③ 推送到 GitHub"
if ! git push; then
  cat <<'EOF'

❌ 推送失败。若提示需要用户名/密码：
   用户名填 hmjmfabc，密码处粘贴 Personal Access Token
   （https://github.com/settings/tokens，权限选 Contents: Read and write）
   想以后免输入可先执行：git config --global credential.helper store
EOF
  exit 1
fi

cat <<'EOF'

✅ 已推送。GitHub Pages 会在 1 分钟左右自动重新发布：
   https://hmjmfabc.github.io/
   https://status.swordsman.top/   （DNS 生效后）
EOF
