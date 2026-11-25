#!/bin/bash
# 숏폼 편집기용 컴포지션 폴더 만들기
# 사용법: bash init_project.sh <edit/slug 폴더> <편집 기준 영상(cuts/03_level.mp4 등)>
# 결과: <edit/slug>/video/main/ 에 media · fonts · sfx 폴더, edit.json, hyperframes.json, package.json
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJ="${1:?프로젝트 폴더(edit/<slug>)를 주세요}"
SRC="${2:?편집 기준 영상 파일을 주세요}"
COMP="$PROJ/video/main"
mkdir -p "$COMP/media" "$COMP/fonts" "$COMP/sfx"
NAME="$(basename "$SRC")"
cp "$SRC" "$COMP/media/$NAME"

# 길이 (ffprobe)
DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" | awk '{printf "%.2f", $1}')"

# 글꼴: 이 스킬에 든 OFL 글꼴(Pretendard · Black Han Sans · Jua · Do Hyeon · Gowun Dodum · Nanum Pen Script)과 라이선스를 복사
#       (프로젝트 assets/fonts 에 같은 이름 파일이 있으면 그것을 먼저 쓴다)
if [ -d "$PROJ/assets/fonts" ]; then cp -n "$PROJ/assets/fonts/"*.ttf "$COMP/fonts/" 2>/dev/null || true; fi
cp -n "$HERE/fonts/"* "$COMP/fonts/" 2>/dev/null || true
# 효과음 (직접 합성한 것, 외부 음원 없음)
cp -n "$HERE/sfx/"*.mp3 "$COMP/sfx/" 2>/dev/null || true
[ -f "$COMP/fonts/PretendardVariable.ttf" ] || echo "알림: fonts/PretendardVariable.ttf 가 없어요. 스킬의 tools/editor/fonts/ 를 확인해 주세요."

# edit.json 은 이미 있으면 덮어쓰지 않는다 (편집 내용 보호)
if [ ! -f "$COMP/edit.json" ]; then
  cat > "$COMP/edit.json" <<JSON
{
 "width": 1080, "height": 1920, "duration": $DUR,
 "source": "media/$NAME",
 "captions": [], "overlays": [], "camera": [], "effects": [], "feedback": [],
 "style": { "cap": {}, "head": {}, "roles": {} }, "sfx": [],
 "hooks": [], "hookPick": null, "layout": "full", "panels": []
}
JSON
else
  echo "edit.json 이 이미 있어서 그대로 뒀어요."
fi

[ -f "$COMP/hyperframes.json" ] || cat > "$COMP/hyperframes.json" <<'JSON'
{
  "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
  "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  "paths": { "blocks": "compositions", "components": "compositions/components", "assets": "assets" },
  "media": { "autoProxy": true },
  "authoringSkill": "customer-eye-contact"
}
JSON
[ -f "$COMP/package.json" ] || cat > "$COMP/package.json" <<'JSON'
{
  "name": "main",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "npx --yes hyperframes@0.9.40 check",
    "render": "npx --yes hyperframes@0.9.40 render"
  }
}
JSON

# 렌더용 index.html 을 한 번 만들어 둔다 (편집기와 같은 scene.js)
node "$HERE/build.ts" "$COMP" >/dev/null
echo "준비 끝: $COMP (길이 ${DUR}초)"
echo "편집기 열기: node \"$HERE/server.ts\" --project \"$PROJ\" --port 4317  →  http://localhost:4317"
