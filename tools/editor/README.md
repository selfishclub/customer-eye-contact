# 셀피쉬 영상 편집기 (로컬)

`customer-eye-contact`(고객 눈맞춤) 에서 쓰는 자체 편집기. **편집 미리보기는 항상 이 편집기로 연다. `hyperframes preview`(HyperFrames 스튜디오)로 열지 않는다.** 브라우저에서 열리는 로컬 앱이고, 설치할 것 없이 Node 24 이상만 있으면 돈다. 미리보기와 렌더는 같은 `scene.js` 로 그리므로 편집기에서 본 것이 렌더에 그대로 나온다.

```bash
# 처음 한 번: 컴포지션 폴더 만들기 (글꼴 · edit.json · index.html 까지)
bash <스킬 경로>/tools/editor/init_project.sh edit/<slug> <영상.mp4>
# 편집기 열기
node <스킬 경로>/tools/editor/server.ts --project edit/<slug> [--comp edit/<slug>/video/main] [--port 4317]
```
→ http://localhost:4317

## 하는 일
| 기능 | 어떻게 |
|---|---|
| 훅 3개 전환 | 화면 위 「훅 A / B / C」 탭을 누르면 그 훅으로 정해지고 처음부터 재생. 「▶ 훅 3개 차례로 보기」는 셋을 잠깐씩 바꿔 가며 차례로 재생(저장은 안 바뀜). 렌더에는 고른 훅 하나만 들어감 |
| 스타일 (값으로) | 오른쪽 「스타일」: 무엇을(자막 · 훅 제목 · 말풍선 · 챕터) × 어디에(전체 · 선택한 것만 · 같은 역할 자막에)를 고르고, 「글자 · 상자 · 강조 · 모션 · 위치」 접기 칸에서 값을 하나씩 바꿈. 「시작점」은 프리셋 값을 칸에 채워 줄 뿐, 그다음 다 고칠 수 있음. • 표시 = 이 범위에서 따로 정한 값 |
| 역할 | 자막을 고르고 「선택한 것」에서 역할(일반 · 강조 · 질문 · 숫자 · 마무리)을 달면, 「같은 역할 자막에」로 역할마다 다른 모션 · 색 |
| 색 | 모든 색 칸: 색 선택기 + #hex 직접 입력 + 💧 스포이트(브라우저가 EyeDropper 를 지원하면 화면 어디서나, 아니면 왼쪽 레퍼런스나 가운데 미리보기를 눌러 그 픽셀 색. ⌥ 누른 채 레퍼런스를 눌러도 됨). 「색 칩」 줄 = 레퍼런스에서 뽑은 색 · 최근 쓴 색 (누르면 마지막에 누른 색 칸에 들어감) |
| 레퍼런스 나란히 | 왼쪽에 `refs/` 영상 · 이미지. 영상은 「같이 재생」(내 미리보기 시각을 따라감) 또는 따로, 프레임은 번호 · ◀▶ 로 넘김 |
| 대조표 | `refs/ref-style.json` 이 있으면 글꼴 느낌 · 크기 · 글자색 · 상자 · 외곽선 · 위치 · 강조 · 모션을 레퍼런스 값 ↔ 지금 값으로 나란히, 항목마다 「맞음 / 더 가깝게 / 일부러 다르게」 체크(→ `refCheck`) · 「→ 적용」 · 「이 값으로 적용」 |
| 🎬 모션 한눈에 보기 | 위 버튼 또는 스타일 「모션」 · 「강조 방식」 옆 🎬. 화면 전체 팝업에 카드가 계속 반복 재생: 탭 = 자막 모션 · 글자 모양 · 강조 방식 · 줌 · 카메라 · 훅 등장 모션 · 화면 전환 · 그림판 (모션 · 글자 모양은 「느낌」 묶음으로 거름). 배경은 지금 프레임 스틸, 문구는 고른 자막(없으면 그 역할 첫 자막). 위에서 어디에(전체 · 선택 · 같은 역할) · 역할 · 속도를 고르고 카드를 누르면 바로 적용(✓ 지금 적용됨). 줌 카드는 재생 위치에 효과를 넣음. 카드는 렌더와 같은 `scene.js` 로 그림 |
| 기본 편집 틀 | 「기본 편집 틀」 카드: 전체 화면 · 반반 컷 · 위 제목 띠 · 글자 카드 (`layout`). 반반 컷 · 글자 카드는 「＋ 패널」로 구간마다 켜고, 타임라인 「틀 패널」 줄에서 길이 · 위치, 「선택한 것」에서 제목 · 설명 · 이미지 · 바탕색 · 등장 · 퇴장 |
| 시각 자료 레이아웃 | 그림판 · 대화 화면 · 장면 컷 하나하나에 `layout`: `full` 전체 화면 카드(영상 가림, 1.5~3초) · `splitTop` 반반 위 자료/아래 얼굴 · `splitBottom` 반반 위 얼굴/아래 자료 · `pip` 화면 속 화면(큰 자료 + 얼굴 동그라미, `pipPos` tr · tl · br · bl) · `float` 얼굴 위 떠 있는 카드(뒤 영상 어둡게). 🎬 「레이아웃」 탭에서 고른 자료를 8칸(화면 속 화면 4곳 포함)으로 나란히 보고 고름. 자료가 떠 있는 동안 자막은 얼굴 · 자료를 피해 자리가 자동으로 바뀜 |
| 그림판 템플릿 | 패널 `tpl`: `bigNumber` 큰 숫자 카드 · `compare` 사실 비교 카드 · `checklist` 체크리스트 · `calendar` 달력 · `route` 경로 · 지도 · `quote` 인용 카드 · `timeline` 타임라인 · `chat` 대화 화면. 값은 `tplData`(아래). 직접 그린 SVG 아이콘 · 둥근 카드 · 부드러운 그림자 · Pretendard 3단 크기, 강조 색은 그 사람 스타일의 강조색(`--acc`). 🎬 「그림판」 탭 카드로 고름 |
| 대화 화면 (메신저) | 실제 앱 화면 구조(앱 로고 · 이름 없음, 실제 캡처 쓰지 않음): 상태바 9:41 · 신호 · 와이파이 · 배터리 / 대화방 머리(뒤로 · 이름 · 검색 · 메뉴) / 날짜 칩 / 회색 사람 모양 프로필 + 이름 / 꼬리 달린 말풍선 · 옆 시간 · 안 읽음 1 / 아래 입력창. `theme`: `yellow` 노랑 말풍선(배경 #B2C7DA · 내 #FEE500 · 상대 흰색) · `blue` 파랑 말풍선(흰 배경 · 내 #0A84FF · 상대 #E9E9EB) · `white` 흰 말풍선. `frame`(폰 테두리, 기본 켬) · `messages: [{from:"them"\|"me", text, at}]` · `title`(일반 오버레이) / `chatTitle`(그림판) · `hideName`(첫 글자+OO) · `showTime` · `showRead`(안 읽음 1, 기본 켬) · `bubbleAnim`(pop · slide · rise · typing) · `gap` · `colors:{bg,them,me}`. 메시지가 아래에서 차례로 올라오며 위로 밀리고, 입력 중 점 → 말풍선, 안 읽음 1이 사라짐. 본문 40px · 작은 글자도 32px 이상 |
| 효과음 | 「넣기」의 ▶ 로 들어 보기, 효과음을 고르면 크기 · ▶. 「역할별 효과음 제안」= 역할 달린 자막마다(강조=쿵 · 숫자=딸깍 · 질문=핑 · 마무리=딩) 끄고 켜서 한 번에 넣기 |
| 내 스타일 | 지금 값 묶음을 이름 붙여 저장(`myStyles`) · 불러오기 · 「파일로」(편집 폴더 `my-style.json`, 저장소 `규칙/` 에 복사해 두면 다음 영상에도 씀) |
| 효과 | 효과 이름을 누르면 재생 위치에 들어감, ▶ 는 넣지 않고 미리보기만. 노란 동그라미로 중심, 타임라인 끝을 끌어 길이 |
| 장면 컷 끼우기 | 「넣기」에서 「장면 컷 끼우기」→ media/ 의 다른 영상을 그 시간 동안 화면 전체로. 자막 · 위 글자 · 스티커는 그 위에 보임 |
| 이미지 스티커 | 「넣기」에서 「이미지 스티커」→ 투명 PNG(캐릭터 등)를 끌어 놓고, 둥실 · 흔들흔들 같은 계속 움직임. 말풍선(bubble)과 같이 쓰면 말하는 것처럼 |
| 자막 고치기 | 화면에서 끌어 위치, 「선택한 것」에서 글자 · 시각 · 크기 · 색 · 모션, 재생 위치에서 나누기. 긴 자막은 자동으로 두 줄 · 화면 폭에 맞춤 |
| 아이콘 · 위 글자 | 폴더 · 터미널 · 이모지 카드 · 위 글자 · 말풍선 등. 끌어 옮기기, 등장 · 퇴장 고르기 |
| 카메라 키프레임 | ◆(K)로 시각마다 확대 · 중심을 찍으면 그 사이를 움직임 |
| 📍 피드백 · Claude에게 보내기 · 렌더 · 자동 저장 | `editor-inbox/`, `renders/edit-<시각>.mp4`, `.edit-history/` 50개 |

## edit.json 필드 (스타일은 값으로)
```jsonc
{
  "style": {
    "cap":  { /* 전체 자막 값 (아래 「스타일 값」) */ "font": "Pretendard", "color": "#ffffff", "motion": "rise" },
    "head": { /* 훅 제목 · 위 큰 글자 값 */ },
    "bubble":  { "font": "Jua", "color": "#111111", "boxColor": "#ffffff", "strokeColor": "#111111", "strokeWidth": 5 },
    "chapter": { "color": "#ffffff", "boxColor": "#111111", "radius": 12, "pad": 34 },
    "roles": { "emphasis": { "motion": "slam", "boxOn": true, "boxColor": "#ffe14d", "color": "#111111" },
               "question": { "motion": "bounce" } }          // 역할: normal · emphasis · question · number · ending
  },
  "captions": [ { "id": "cap01", "start": 0, "end": 1.7, "text": "이 영상 **촬영하지 않았어요**",
                  "role": "emphasis",                          // 선택: 역할
                  "look": { "motion": "bounce", "color": "#ff4d6d" },  // 선택: 이 자막만 다른 값
                  "noEmphasis": true,                          // 선택: 효과 · 후기 문장 → 강조 표시(**) · 역할 모양 · 줌 · 효과음 제안 · 하이라이트 후보에서 모두 뺌 (역할이 「마무리」여도)
                  "x": 540, "wrap": false, "fit": false } ],
  "hooks": [ { "id": "hookA", "label": "훅 A", "text": "이 영상\n**촬영 안 했어요**", "end": 3,
               "zoom": "crash", "sticker": "😳", "look": { "motion": "slam", "font": "BlackHanSans" } } ],
  "hookPick": "hookA",
  "overlays": [ { "kind": "bubble", "look": { "boxColor": "#cfeeff" } } ],   // 말풍선 · 챕터 · 위 큰 글자도 look 으로 하나만
  "effects": [ { "type": "zoomIn", "start": 3, "end": 4.5, "strength": 1, "ax": 540, "ay": 800, "ease": "snap" } ],  // ease: smooth · snap · bounce
  "layout": "split",               // full · split · titleBand · card
  "panels": [ { "id": "pn1", "start": 13.9, "end": 21.5, "title": "아바타 만들기 **3단계**", "text": "① 정면 ② 목소리 ③ 배경",
                "callouts": "32,62,합곡\n70,48,곡지",              // 그림판: 선 그어 짚기 (줄마다 가로%,세로%,라벨)
                "chart": "bar", "chartData": "1주,2\n2주,3", "chartUnit": "회", "chartMax": "",  // 그림판: bar 막대 자라기 · gauge 게이지 채우기 (말한 숫자만)
                "image": "media/char.png", "bg": "#f4f1ea", "color": "#111214", "enter": "slide", "exit": "slide", "shift": 620 } ],  // split: 위 패널(얼굴은 shift 만큼 아래로) · card: 화면 전체 글자 카드. enter/exit: slide · fade · pop · cut · colorWipe(색면 와이프) · lightLeak(빛 띠 지나가기)
  // 그림판 패널 (자료마다 레이아웃 · 템플릿)
  "panels": [ { "id": "pn2", "start": 9, "end": 11.5, "layout": "pip", "pipPos": "tr", "tpl": "calendar", "title": "두드러기 난 날",
                "tplData": { "year": "2026", "month": "11", "marks": "3,6,8" } } ],
  //   tplData — bigNumber: number · unit · desc / compare: leftLabel · leftValue · rightLabel · rightValue
  //             checklist: items(줄마다) / calendar: year · month · marks(쉼표) / route: from · to · mode(train · car · bus · walk · plane)
  //             quote: text · source / timeline: items(줄마다 「이름,길이 숫자,표시 글」) / chat: messages · theme · frame …
  //   compare 는 사실 비교만(「처음 3일에 한 번 → 지금 2일에 한 번」). 치료 전후 비교 · 효과 보장 표현에는 쓰지 않는다 (의료광고).
  //   숫자 · 날짜 · 말은 영상에서 실제로 말했거나 본인이 확인한 것만.
  "band": { "text": "한의사가 알려주는 **잠**", "bg": "#111214", "color": "#ffffff", "h": 360, "size": 78 },        // titleBand 일 때 위 띠
  "sfx": [ { "name": "impact-bass-1", "file": "sfx/impact-bass-1.mp3", "start": 10.08, "end": 11.48, "volume": 0.45, "capId": "cap05", "auto": true } ],
  "refCheck": { "r1": { "font": "closer", "color": "match", "motion": "different", "updatedAt": "…" } },
  "myStyles": [ { "name": "우리 한의원 자막", "savedAt": "…", "style": { "cap": {}, "head": {}, "bubble": {}, "chapter": {}, "roles": {} } } ]
}
```
값이 정해지는 순서 — 자막: 기본값 → `style.cap` → `style.roles[역할]` → 예전 자막 칸(`size` · `color` · `y` · `motion`) → `caption.look`. 훅: 기본값 → `style.head` → 예전 훅 칸(`style.look/size/y`, `enter`) → `hook.look`.
「전체에」로 바꾸면 하나하나 따로 정한 같은 값은 지워져 전체를 따른다(역할 값은 그대로).
효과음 `sfx` 는 예전 형식(`name` · `kind` 없이 `file` 만)도 파일 이름으로 이름을 보여 준다. 예전 edit.json(`style.preset` · `captionMotion` · `accent` 만 있는 것)은 열 때 그 프리셋 값을 풀어서 `style.cap` · `style.head` 에 채운다. 새 프로젝트는 중립값(흰 글자 + 얇은 그림자, 아래에서 올라옴)으로 시작하고, Claude가 레퍼런스 · 코어 값으로 채운다.

### 스타일 값 (자막 · 훅 제목 공통 키)
| 묶음 | 키 |
|---|---|
| 글자 | `font`(Pretendard · BlackHanSans · Jua · DoHyeon · GowunDodum · NanumPenScript) · `weight`(400~900) · `size`(px) · `color` · `tracking`(자간, em) · `lineHeight` |
| 상자 | `boxOn` · `boxColor` · `boxOpacity`(0~1) · `radius`(px) · `pad`(옆 여백 px, 위아래는 0.38배) · `strokeColor` · `strokeWidth`(px, 배경 없을 때만) · `shadowOn` · `shadowColor` · `shadowY`(번짐 없는 그림자 거리 px) |
| 강조 | `emMode`(color 색만 · marker 형광펜 띠 · box 강조 칩 · underline 밑줄 · big 크게 · stroke 외곽선 색 · circle 손그림 동그라미 · dots 방점 찍기 · brackets 모서리 괄호 조준 · stamp 낙관 도장) · `emColor` · `emTextColor` |
| 모션 | `motion` · `speed` · `delay` · `exit`(나갈 때) |
| 모션 | `motion`(아래 목록) · `speed`(fast · normal · slow, 또는 배수 숫자) · `delay`(초) |
| 위치 | `y`(px, 글자 윗변) · `align`(center · left · right, x 기준) · `maxWidth`(한 줄 최대 폭 px, 넘으면 두 줄 · 작게) |
색은 `#rrggbb` 또는 투명도까지 `#rrggbbaa`.

### 글자 모양(룩) 23개 (`STYLE_PRESETS`, 편집기 「글자 모양 고르기」 카드 · 🎬 보드 「글자 모양」 탭)
| 묶음 | 룩 |
|---|---|
| 블록 | `blackBlock` 블랙 블록(새 프로젝트 기본) · `whiteBlock` 화이트 블록 · `neonBlock` 형광 블록 · `tape` 테이프 자막바 · `pill` 타원 자막바 |
| 스티커 | `sticker` 스티커 이중 테두리 · `roundBubble` 동글 말풍선 · `colorChips` 컬러 칩 키워드 |
| 그라데이션 | `gradSunset` 노을 · `gradSoda` 소다 · `gradCandy` 캔디 · `chrome` 크롬 · 메탈 · `neonHard` 선명 네온 |
| 예능 | `cleanWhite` 깔끔 흰 글자 · `variety` 예능 굵은 외곽선 · `block3d` 굵은 블록 그림자 |
| 감성 | `paperMemo` 종이 메모 · `docu` 다큐 담백 · `quote` 큰 따옴표 인용 · `washi` 한지 띠 |
| 정보 | `blackKeyword` 블랙 + 노랑 키워드 · `newspaper` 신문 헤드라인 · `twoTier` 2단 크기 대비 · `nametag` 이름표 · `rail` 가로 띠 레일 · `chalk` 칠판 · `receipt` 영수증 |
누르면 글꼴 · 배경 · 색 · 꾸밈 값을 한 번에 채우고(모션 · 위치는 그대로), 훅 제목은 같은 값에서 크기만 키운다. 예전 이름(`whiteBox` · `momdi` 등)은 예전 edit.json 을 열 때만 쓴다.
꾸밈 값: `fx`(none · sticker · gradient · chrome · tape · pill · quote · twoTier · chips · neonHard · block3d · rail · washi · chalk · receipt) · `fxColor`(바깥 테두리 · 네온 · 압출 · 테이프 · 타원 선 색) · `gradA` · `gradB`(그라데이션 위 · 아래) · `nametag`(자막 위 이름 칩 글자, 비우면 없음).
`twoTier` 는 **강조** 앞을 작은 윗줄(다른 글꼴), 강조부터를 큰 아랫줄로 나눈다(강조가 없으면 뜻 단위로 반으로 나누고 아랫줄을 크게).
그리는 규칙: 번짐 없음(그림자 · 네온 · 압출 모두 번짐 0) · 배경이 있으면 외곽선 · 그림자 없음 · 상자는 줄마다 글자 폭만큼(`.sf-ln`, 줄 사이 5px) · 한 줄 최대 폭 860 · 배경 없는데 글자가 어두우면 흰 글자 + 검은 외곽선으로 그림.

## 레퍼런스 폴더와 `refs/ref-style.json`
레퍼런스는 **편집 폴더(`--project`) 아래 `refs/`** 에 둔다 (`edit/<slug>/refs/`). 영상(mp4 · mov · webm)과 이미지(png · jpg · webp)가 왼쪽에 나온다.
Claude가 레퍼런스를 분석해 같은 폴더에 `ref-style.json` 을 쓰면 대조표가 나온다:
```jsonc
{ "version": 1,
  "refs": [ {
    "id": "r1", "name": "@계정 릴스 3초",            // 이름은 보기용
    "src": "refs/r1.mp4",                             // 원본 (영상 또는 이미지)
    "frames": ["refs/r1_f1.jpg", "refs/r1_f2.jpg"],   // 뽑은 프레임 (넘겨 보기)
    "values": { "font": "BlackHanSans", "weight": 400, "size": 76, "color": "#ffffff", "boxOn": false,
                "strokeColor": "#111111", "strokeWidth": 10, "y": 1250, "align": "center",
                "emMode": "color", "emColor": "#f2e600", "motion": "slam", "speed": "fast" },  // 스타일 값과 같은 키
    "colors": ["#f2e600", "#1a1a1a"],                 // 색 칩 줄에 나오는 색
    "motionNote": "자막이 0.2초 만에 크게 떨어져 박힘", "note": "강조어만 노랑" } ] }
```

### 모션 이름 (`motion` 값. 예전 `style.captionMotion` · `caption.motion` · `hook.enter` 도 읽음) — 27개, 보드에서 느낌별로 거름
| 묶음 | 모션 |
|---|---|
| 기본 | `none` 없음 · `pop` 팝 · `rise` 아래에서 올라옴 · `slide` 옆에서 밀려옴 · `lineRise` 줄마다 올라오기 · `dropDown` 위에서 내려오기 |
| 통통 귀여움 | `words` 낱말 하나씩 · `bounce` 튕김 · `jelly` 젤리 글자 · `bounceRhythm` 통통 리듬 · `landSquash` 착지 스쿼시 · `stopMotion` 스톱모션 붙이기 |
| 강렬 예능 | `slam` 쾅 · `shakeIn` 흔들리며 등장 · `zoomSettle` 확대 후 제자리 · `emphasis` 강조어만 툭 · `weightWave` 굵기 물결 · `flicker` 깜빡 켜짐 · `outlineFill` 외곽선에서 채우기 |
| 훅 전용 | `searchBar` 검색창 타이핑 · `chatStack` 말풍선 톡톡 쌓기(줄마다 말풍선) · `stompWords` 한 단어씩 화면 가득 |
| 감성 | `typing` 타자 · `blur` 흐림에서 선명 · `flip` 뒤집혀 등장 · `colorIn` 색 입히기 · `widthWave` 폭 물결 · `wipe` 왼쪽부터 닦아 나타나기 |
| 정보 | `marker` 형광펜 칠 · `karaoke` 카라오케 · `boxUnfold` 상자 펼치기 · `cardFlip` 카드 뒤집기 · `swap` 같은 자리 바꿔 끼우기 |
| 숫자 | `numberRoll` 숫자 굴리기 (자막에 있는 숫자만 0부터 올라가 원래 숫자에서 멈춤) |
`swap` 은 강조 칸에 `/` 로 낱말을 나열한다: `**허리/목/어깨** 통증` → 「허리」 → 「목」 → 「어깨」 차례로 같은 자리에서 바뀜.
**나갈 때** `exit`(자막 · 훅 공통, 스타일 「모션」 칸): `none` 없음 · `up` 위로 빠지기 · `scatter` 조각 흩어지기(상자 있으면 줄 조각, 없으면 낱말 조각, 정해진 방향) · `fade` 페이드.
모두 정해진 순서(무작위 없음)이고 끝나면 제자리 · 읽기 좋은 상태로 멈춘다. 커지는 모션은 자리 자체가 넓어지는 방식(글자 크기 · 굵기 · 자간)이라 옆 글자와 겹치지 않는다.

### 효과 (`effects[].type`, 모두 기준점 `ax, ay` · `strength` · `ease`(smooth 부드럽게 · snap 툭 · bounce 튕김) 사용, 무작위 없음. 편집기 「선택한 것」에서 길이 · 세기 · 중심 · 움직임을 고침)
`zoomIn` 줌 인 · `zoomOut` 줌 아웃 · `punch` 펀치 줌 · `punchOut` 펀치 아웃 · `slowPush` 슬로우 푸시 · `snapZoom` 스냅 줌 · `doublePunch` 더블 펀치 · `crash` 크래시 줌(하얀 번쩍) · `blurZoom` 블러 줌 · `rotateZoom` 회전 줌 · `bounceZoom` 바운스 줌 · `heartbeat` 하트비트 · `zoomHold` 줌 인 홀드 · `zoomReveal` 줌 아웃 리빌 · `kenBurns` 켄 번즈 · `panLR` 좌우 팬 · `tiltUD` 위아래 틸트 · `dutch` 더치 틸트 · `shake` 흔들림 · `handheld` 손떨림 · `flash` 하얀 번쩍 · `dipBlack` 암전 깜빡 · `bw` 흑백 · `spotlight` 스포트라이트(중심 둘레만 밝게)
효과는 촬영본 층에만 걸리고, 자막 · 훅 · 스티커 · 장면 컷은 흔들리지 않는다. 같은 시간에 줌 효과 두 개를 겹치면 뒤엣것이 이긴다.

## 글꼴 (`fonts/`)
모두 SIL Open Font License(재배포 가능). 라이선스 파일이 같은 폴더에 있다. `init_project.sh` 와 `build.ts` · `server.ts` 가 컴포지션 `fonts/` 로 복사한다.
Pretendard · Black Han Sans(예능) · Jua(파스텔 · 말풍선) · Do Hyeon(신문) · Gowun Dodum(다큐) · Nanum Pen Script(손글씨). Pretendard 외에는 Google Fonts 공식 저장소(github.com/google/fonts, `ofl/`)에서 받은 것.
GmarketSans 는 들어 있지 않다 (예전 `momdi` 룩의 위 큰 글자는 Pretendard 로 보임).

## 효과음 (`sfx/`)
`pop` 팝 · `click` 딸깍 · `click-soft` 작은 딸깍 · `whoosh-short` · `whoosh` 휙 · `typing` 타자 · `key-press` 키 · `ping` 핑 · `sparkle` 반짝 · `notification` 띵동 · `chime` 딩 · `impact-bass-1` 쿵.
모두 `sfx/make_sfx.sh` 로 ffmpeg 합성해 직접 만든 소리라 외부 음원 라이선스가 없다(`LICENSE-sfx.txt`). `init_project.sh` · `build.ts` · `server.ts` 가 컴포지션 `sfx/` 로 복사한다.

## 파일
- `server.ts` — 서버 (파일 · 저장 · 보내기 · 렌더 · media 목록)
- `build.ts` — `edit.json` → HyperFrames `index.html` (`node build.ts <컴포지션 폴더>`)
- `scene.js` — 화면 · 애니메이션 공용 코드 (편집기와 렌더가 같이 씀). 룩 · 모션 · 효과 목록도 여기
- `public/` — 편집기 화면
- `fonts/` — OFL 글꼴 + 라이선스
- `sfx/` — 직접 합성한 효과음 + 만드는 스크립트

## Claude가 피드백을 받는 법
1. `editor-inbox/`의 가장 새 파일을 읽는다 (대기 피드백 · 보낸 말 · 재생 위치).
2. `video/main/edit.json`을 고친다 (편집기가 열려 있으면 2초 안에 자동으로 다시 불러옴). 사람이 읽는 목록은 `FEEDBACK.md`.
3. 반영한 피드백은 `status: "done"`으로 바꾼다.
`index.html`은 자동 생성 파일이라 직접 고치지 않는다.

## 렌더가 안 될 때
`npx hyperframes@0.9.40` 가 아무 말 없이 실패하면 npx 캐시가 반쯤 깔린 것일 수 있다: `~/.npm/_npx/` 안에서 `node_modules/hyperframes/package.json` 이 없는 폴더를 지우고 다시 렌더.
