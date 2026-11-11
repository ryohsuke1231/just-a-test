# ---- choice-study を just-a-test に反映するコマンド（~/.bashrc に貼る） ----
# 使い方:
#   csup "コミットメッセージ"      … ダウンロードの最新版を配置してコミット
#   csup -p "コミットメッセージ"   … さらに GitHub へ push（失敗したら3回まで再試行）
csup() {
  local push=0
  if [ "$1" = "-p" ]; then push=1; shift; fi
  local msg="$1"
  if [ -z "$msg" ]; then
    echo '使い方: csup [-p] "コミットメッセージ"'
    return 1
  fi

  local dl="$HOME/storage/downloads"
  local repo="$HOME/just-a-test"
  local dest="$repo/choice-study/choice-study" # Vercel の Root Directory と同じ場所

  [ -d "$repo/.git" ] || { echo "リポジトリが見つかりません: $repo"; return 1; }

  # ダウンロードにある choice-study（フォルダでもzipでも）のうち、一番新しいもの
  local latest
  latest=$(ls -1td "$dl"/choice-study* 2>/dev/null | head -n 1)
  [ -n "$latest" ] || { echo "ダウンロードに choice-study が見つかりません"; return 1; }
  echo "使うもの: $latest（$(date -r "$latest" '+%m/%d %H:%M')）"

  local tmp="" src="$latest"
  if [[ "$latest" == *.zip ]]; then
    command -v unzip >/dev/null || { echo "unzip がありません。pkg install unzip を実行してください"; return 1; }
    tmp=$(mktemp -d)
    unzip -q "$latest" -d "$tmp" || { rm -rf "$tmp"; echo "zipを展開できませんでした"; return 1; }
    src="$tmp"
  fi

  # 中を探して、package.json と app/ が両方あるフォルダ（＝プロジェクトの本体）を見つける
  local proj
  proj=$(find "$src" -name node_modules -prune -o -type f -name package.json -print 2>/dev/null \
    | while IFS= read -r f; do d=$(dirname "$f"); [ -d "$d/app" ] && echo "$d"; done \
    | awk '{ print length($0) "\t" $0 }' | sort -n | head -n 1 | cut -f 2-)
  if [ -z "$proj" ] || ! grep -q '"name": *"choice-study"' "$proj/package.json"; then
    echo "choice-study のプロジェクト（package.json と app/）が見つかりません"
    [ -n "$tmp" ] && rm -rf "$tmp"
    return 1
  fi
  echo "プロジェクト: ${proj#$src/}"

  # 入れ替え（node_modules や .next は持ち込まない）
  rm -rf "$dest" && mkdir -p "$dest" && cp -r "$proj"/. "$dest"/ && rm -rf "$dest/node_modules" "$dest/.next"
  [ -n "$tmp" ] && rm -rf "$tmp"

  (
    cd "$repo" || exit 1
    git add -A
    if git diff --cached --quiet; then
      echo "変更はありませんでした（コミットしません）"
      exit 0
    fi
    git status --short | head -n 20
    git commit -q -m "$msg" && echo "コミットしました: $msg" || exit 1
    if [ "$push" = 1 ]; then
      local i
      for i in 1 2 3; do
        timeout 90 git push -q origin main && { echo "push しました"; exit 0; }
        echo "push に失敗（${i}回目）。5秒後にもう一度…"
        sleep 5
      done
      echo "push できませんでした。あとで git -C ~/just-a-test push origin main を実行してください"
      exit 1
    fi
  )
}
