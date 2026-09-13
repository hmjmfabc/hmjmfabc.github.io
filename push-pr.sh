#!/data/data/com.termux/files/usr/bin/bash
# 把站点代码以分支 + Pull Request 的方式提交到
# mingyu-games-wmjbfs/status-swordsman.github.io（不直接改 main）
#
# 用法：
#   ./push-pr.sh
#
# 需要该仓库的写权限。推送时会要求身份验证：
#   Username → hmjmfabc
#   Password → 你的 Personal Access Token（粘贴时不显示）
#
# 若提示 "Permission ... denied"，说明当前凭据对该仓库没有写权限，依次检查：
#   1. 协作者邀请是否已接受：https://github.com/mingyu-games-wmjbfs/status-swordsman.github.io/invitations
#   2. 令牌的 Repository access 是否包含该仓库（或选 All repositories）
#      https://github.com/settings/personal-access-tokens

set -euo pipefail
cd "$(dirname "$0")"

BRANCH="add-status-site"
REPO="mingyu-games-wmjbfs/status-swordsman.github.io"
URL="https://github.com/${REPO}.git"
PR_URL="https://github.com/${REPO}/compare/main...${BRANCH}?expand=1"

echo "① 确认待推送分支"
git log --oneline -1 "$BRANCH"
echo "   相对该仓库 main 的改动：$(git diff --stat "sgu/main..$BRANCH" 2>/dev/null | tail -1 || echo '(约 40 个文件)')"

echo
echo "② 推送分支 $BRANCH（不涉及 main）"
if git -c http.version=HTTP/1.1 push "$URL" "${BRANCH}:${BRANCH}"; then
  cat <<EOF

✅ 分支推送成功！

③ 打开下面链接创建 Pull Request（管理员 Merge 后即部署）：
   ${PR_URL}

   （GitHub 也会在仓库首页显示 "Compare & pull request" 按钮，直接点也行）
EOF
else
  cat <<EOF

❌ 推送失败。请依次检查：

1) 协作者邀请是否已接受（用 hmjmfabc 登录后打开）：
   https://github.com/${REPO}/invitations

2) 令牌的 Repository access 是否包含该仓库：
   https://github.com/settings/personal-access-tokens
   → 打开你的令牌 → Repository access 改成 All repositories（或勾选该仓库）
   → 确认 Permissions → Contents = Read and write → Save

3) 若仍失败，可改用「管理员网页导入」方案（无需任何权限配置）：
   https://github.com/new/import
   Old repository's clone URL 填： https://github.com/hmjmfabc/hmjmfabc.github.io.git
EOF
  exit 1
fi
