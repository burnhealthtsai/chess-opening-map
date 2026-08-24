#!/bin/zsh
set -u

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
cd "$PROJECT_DIR" || exit 1

"$PROJECT_DIR/.venv/bin/python" "$PROJECT_DIR/scripts/import_notion_secure.py"
STATUS=$?
echo
if [[ $STATUS -ne 0 ]]; then
  echo "匯入未完成。請保留上方錯誤訊息，回到 Codex 繼續排查。"
fi
echo "按 Return 關閉視窗。"
read
exit $STATUS
