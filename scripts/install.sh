#!/usr/bin/env bash
# 고객 눈맞춤 스킬 — 글꼴 · 도구 한 번에 설치 (맥 · 리눅스)
#
#   bash scripts/install.sh                 # 점검 + 스킬 글꼴 채우기 (아무것도 새로 깔지 않음)
#   bash scripts/install.sh --tools         # 없는 도구 설치 (ffmpeg · yt-dlp · Node · 받아쓰기)
#   bash scripts/install.sh --system-fonts  # 글꼴 6종을 내 컴퓨터에도 설치 (캡컷 · 키노트 등에서도 쓰게)
#   bash scripts/install.sh --all           # 위 둘 다
#
# 글꼴은 모두 무료 OFL(재배포 가능). 스킬 안에 없으면 공개 저장소에서 받아 채운다.
set -u

SKILL="$(cd "$(dirname "$0")/.." && pwd)"
FONT_DIR="$SKILL/tools/editor/fonts"
RAW="https://raw.githubusercontent.com/selfishclub/customer-eye-contact/main/tools/editor/fonts"
FONTS=(PretendardVariable.ttf BlackHanSans-Regular.ttf Jua-Regular.ttf DoHyeon-Regular.ttf GowunDodum-Regular.ttf NanumPenScript-Regular.ttf)
LICENSES=(LICENSE-Pretendard-OFL.txt OFL-blackhansans.txt OFL-jua.txt OFL-dohyeon.txt OFL-gowundodum.txt OFL-nanumpenscript.txt)

DO_TOOLS=0; DO_SYS=0
for a in "$@"; do
  case "$a" in
    --tools) DO_TOOLS=1 ;;
    --system-fonts) DO_SYS=1 ;;
    --all) DO_TOOLS=1; DO_SYS=1 ;;
  esac
done

ok()   { printf "  ✔ %-22s %s\n" "$1" "$2"; }
miss() { printf "  ✖ %-22s %s\n" "$1" "$2"; }
has()  { command -v "$1" >/dev/null 2>&1; }

OS="$(uname -s)"; ARCH="$(uname -m)"
if [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then WMOD=mlx_whisper; WPKG=mlx-whisper; else WMOD=faster_whisper; WPKG=faster-whisper; fi
# 받아쓰기에 쓸 파이썬: 이미 받아쓰기가 깔린 것 → 3.10 이상 → python3 순서
pick_py() {
  for c in python3 python3.13 python3.12 python3.11 python3.10 /usr/bin/python3; do
    has "$c" && "$c" -c "import $WMOD" 2>/dev/null && { echo "$c"; return; }
  done
  for c in python3.13 python3.12 python3.11 python3.10 python3; do
    has "$c" && "$c" -c 'import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)' 2>/dev/null && { echo "$c"; return; }
  done
  has python3 && echo python3
}
pip_in() { "$PY" -m pip install --user "$1" 2>/dev/null || "$PY" -m pip install --user --break-system-packages "$1"; }

# ── 1. 스킬 글꼴 채우기 (편집기 · 렌더가 쓰는 글꼴) ──
echo "■ 스킬 글꼴 (tools/editor/fonts)"
mkdir -p "$FONT_DIR"
for f in "${FONTS[@]}" "${LICENSES[@]}"; do
  if [ -s "$FONT_DIR/$f" ]; then
    case "$f" in *.ttf) ok "$f" "있음" ;; esac
  else
    if curl -fsSL --retry 2 -o "$FONT_DIR/$f.part" "$RAW/$f"; then
      mv "$FONT_DIR/$f.part" "$FONT_DIR/$f"; ok "$f" "받아서 채움"
    else
      rm -f "$FONT_DIR/$f.part"; miss "$f" "못 받음 (인터넷 확인)"
    fi
  fi
done

# ── 2. 글꼴을 내 컴퓨터에도 설치 (선택) ──
if [ $DO_SYS = 1 ]; then
  echo "■ 내 컴퓨터에 글꼴 설치"
  if [ "$OS" = "Darwin" ]; then SYS_DIR="$HOME/Library/Fonts"; else SYS_DIR="$HOME/.local/share/fonts"; fi
  mkdir -p "$SYS_DIR"
  for f in "${FONTS[@]}"; do
    if [ -s "$FONT_DIR/$f" ]; then
      if [ -s "$SYS_DIR/$f" ]; then ok "$f" "이미 설치됨"; else cp "$FONT_DIR/$f" "$SYS_DIR/" && ok "$f" "설치함 → $SYS_DIR"; fi
    fi
  done
  [ "$OS" != "Darwin" ] && has fc-cache && fc-cache -f "$SYS_DIR" >/dev/null 2>&1
  echo "  (열려 있던 앱은 다시 켜야 새 글꼴이 보여요)"
fi

# ── 3. 도구 설치 (선택) ──
if [ $DO_TOOLS = 1 ]; then
  echo "■ 도구 설치"
  if [ "$OS" = "Darwin" ] && ! has brew; then
    miss "Homebrew" "없음 → https://brew.sh 의 한 줄 명령을 터미널에 붙여 넣어 먼저 설치해 주세요 (비밀번호는 본인이 입력)"
  fi
  if has brew; then
    has ffmpeg || brew install ffmpeg
    has yt-dlp || brew install yt-dlp
    if ! has node || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 24 ]; then brew install node; fi
    has python3 || brew install python
  elif [ "$OS" != "Darwin" ]; then
    echo "  리눅스: sudo apt install ffmpeg python3-pip nodejs 처럼 배포판 명령으로 설치해 주세요 (비밀번호는 본인이)"
  fi
  PY="$(pick_py)"
  if [ -n "$PY" ]; then
    "$PY" -c "import $WMOD" 2>/dev/null || pip_in "$WPKG"
    has yt-dlp || pip_in yt-dlp
  fi
fi

# ── 4. 점검표 ──
echo "■ 점검"
has ffmpeg  && ok "ffmpeg"  "$(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3)" || miss "ffmpeg"  "없음 → --tools"
has ffprobe && ok "ffprobe" "있음" || miss "ffprobe" "없음 → --tools (ffmpeg에 같이 들어 있음)"
PY="$(pick_py)"
if [ -n "$PY" ]; then
  PV="$("$PY" -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
  ok "Python" "$PV ($PY)"
  "$PY" -c "import $WMOD" 2>/dev/null && ok "받아쓰기($WPKG)" "있음 · 받아쓰기는 「$PY scripts/transcribe.py」로 · 첫 실행 때 모델 약 1.5GB" || miss "받아쓰기($WPKG)" "없음 → --tools"
else
  miss "Python" "없음 → --tools 또는 python.org"
fi
if has node; then
  NV="$(node -v)"; [ "$(echo "$NV" | sed 's/v//;s/\..*//')" -ge 24 ] && ok "Node" "$NV" || miss "Node" "$NV → 24 이상 필요 (--tools)"
else
  miss "Node" "없음 → --tools 또는 nodejs.org"
fi
has yt-dlp && ok "yt-dlp (선택)" "있음" || miss "yt-dlp (선택)" "없음 → 레퍼런스 링크 받기 · 리서치에 필요 (--tools)"
has npx && ok "렌더(HyperFrames)" "첫 렌더 때 자동으로 받음 (인터넷 필요)" || miss "렌더(HyperFrames)" "npx 없음 → Node 설치"
NF=0; for f in "${FONTS[@]}"; do [ -s "$FONT_DIR/$f" ] && NF=$((NF+1)); done
[ $NF = ${#FONTS[@]} ] && ok "글꼴" "6종 모두 있음" || miss "글꼴" "$NF/6 → 인터넷 연결 뒤 다시 실행"
