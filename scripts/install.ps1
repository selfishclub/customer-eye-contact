# 고객 눈맞춤 스킬 — 글꼴 · 도구 한 번에 설치 (윈도우 PowerShell)
#
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1                 # 점검 + 스킬 글꼴 채우기
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Tools          # 없는 도구 설치 (winget)
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -SystemFonts    # 글꼴 6종을 내 컴퓨터에도 설치
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Tools -SystemFonts
#
# 글꼴은 모두 무료 OFL(재배포 가능). 스킬 안에 없으면 공개 저장소에서 받아 채운다.
param([switch]$Tools, [switch]$SystemFonts)

$Skill   = Split-Path -Parent $PSScriptRoot
$FontDir = Join-Path $Skill "tools\editor\fonts"
$Raw     = "https://raw.githubusercontent.com/selfishclub/customer-eye-contact/main/tools/editor/fonts"
$Fonts   = @("PretendardVariable.ttf","BlackHanSans-Regular.ttf","Jua-Regular.ttf","DoHyeon-Regular.ttf","GowunDodum-Regular.ttf","NanumPenScript-Regular.ttf")
$Lic     = @("LICENSE-Pretendard-OFL.txt","OFL-blackhansans.txt","OFL-jua.txt","OFL-dohyeon.txt","OFL-gowundodum.txt","OFL-nanumpenscript.txt")
function Ok($a,$b)   { Write-Host ("  [v] {0,-24} {1}" -f $a,$b) }
function Miss($a,$b) { Write-Host ("  [x] {0,-24} {1}" -f $a,$b) }
function Has($c)     { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# 1. 스킬 글꼴 채우기
Write-Host "■ 스킬 글꼴 (tools\editor\fonts)"
New-Item -ItemType Directory -Force -Path $FontDir | Out-Null
foreach ($f in $Fonts + $Lic) {
  $dst = Join-Path $FontDir $f
  if ((Test-Path $dst) -and (Get-Item $dst).Length -gt 0) { if ($f -like "*.ttf") { Ok $f "있음" } ; continue }
  try { Invoke-WebRequest -UseBasicParsing -Uri "$Raw/$f" -OutFile $dst; Ok $f "받아서 채움" } catch { Miss $f "못 받음 (인터넷 확인)" }
}

# 2. 내 컴퓨터에 글꼴 설치 (사용자 글꼴 폴더 · 관리자 권한 필요 없음)
if ($SystemFonts) {
  Write-Host "■ 내 컴퓨터에 글꼴 설치"
  $UserFonts = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Fonts"
  New-Item -ItemType Directory -Force -Path $UserFonts | Out-Null
  $Reg = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
  foreach ($f in $Fonts) {
    $src = Join-Path $FontDir $f; if (-not (Test-Path $src)) { continue }
    $dst = Join-Path $UserFonts $f
    if (Test-Path $dst) { Ok $f "이미 설치됨"; continue }
    Copy-Item $src $dst
    New-ItemProperty -Path $Reg -Name ("{0} (TrueType)" -f [IO.Path]::GetFileNameWithoutExtension($f)) -Value $dst -PropertyType String -Force | Out-Null
    Ok $f "설치함"
  }
  Write-Host "  (열려 있던 앱은 다시 켜야 새 글꼴이 보여요)"
}

# 3. 도구 설치 (winget)
if ($Tools) {
  Write-Host "■ 도구 설치"
  if (-not (Has winget)) { Miss "winget" "없음 → Microsoft Store에서 「앱 설치 관리자」를 받아 주세요" }
  else {
    if (-not (Has ffmpeg)) { winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements }
    if (-not (Has node))   { winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements }
    if (-not (Has python)) { winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements }
    if (-not (Has yt-dlp)) { winget install -e --id yt-dlp.yt-dlp --accept-package-agreements --accept-source-agreements }
  }
  if (Has python) { python -c "import faster_whisper" 2>$null; if ($LASTEXITCODE -ne 0) { python -m pip install --user faster-whisper } }
  Write-Host "  (새로 깐 도구는 PowerShell 창을 새로 열어야 잡혀요)"
}

# 4. 점검
Write-Host "■ 점검"
if (Has ffmpeg) { Ok "ffmpeg" "있음" } else { Miss "ffmpeg" "없음 → -Tools" }
if (Has python) {
  $pv = (python -c "import sys;print('%d.%d'%sys.version_info[:2])"); Ok "Python" $pv
  python -c "import faster_whisper" 2>$null
  if ($LASTEXITCODE -eq 0) { Ok "받아쓰기(faster-whisper)" "있음 · 첫 실행 때 모델 받음" } else { Miss "받아쓰기(faster-whisper)" "없음 → -Tools" }
} else { Miss "Python" "없음 → -Tools" }
if (Has node) { Ok "Node" (node -v) } else { Miss "Node" "없음 → -Tools (24 이상)" }
if (Has yt-dlp) { Ok "yt-dlp (선택)" "있음" } else { Miss "yt-dlp (선택)" "없음 → 레퍼런스 링크 받기 · 리서치에 필요 (-Tools)" }
$n = ($Fonts | Where-Object { Test-Path (Join-Path $FontDir $_) }).Count
if ($n -eq $Fonts.Count) { Ok "글꼴" "6종 모두 있음" } else { Miss "글꼴" "$n/6 → 인터넷 연결 뒤 다시 실행" }
