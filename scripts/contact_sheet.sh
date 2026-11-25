#!/usr/bin/env bash
# 영상을 일정 간격 프레임 시트 한 장으로 만든다 (5열, 각 칸에 시각 표시).
# 사용법: bash contact_sheet.sh <영상> [간격초=1] [출력.png]
set -euo pipefail
src="$1"
step="${2:-1}"
out="${3:-${src%.*}_sheet_${step}s.png}"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
# 필요한 칸 수 → 줄 수 (5열)
n=$(python3 -c "import math;print(max(1,math.ceil(float('$dur')/float('$step'))))")
rows=$(( (n + 4) / 5 ))
# drawtext(시각 표시)가 없는 ffmpeg도 있어서, 없으면 시각 없이 만든다
if ffmpeg -hide_banner -filters 2>/dev/null | grep -q " drawtext "; then
  label=",drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6"
  note="시각 표시"
else
  label=""
  note="시각 표시 없음: 왼쪽 위부터 ${step}초 간격"
fi
ffmpeg -y -hide_banner -loglevel error -i "$src" \
  -vf "fps=1/${step},scale=216:-2${label},tile=5x${rows}:padding=4:color=white" \
  -frames:v 1 "$out"
echo "$out (칸 ${n}개, ${note})"
