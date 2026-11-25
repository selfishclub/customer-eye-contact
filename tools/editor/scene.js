// 숏폼 편집기 공용 장면 모듈 — 편집기 미리보기와 HyperFrames 빌드가 같은 코드로 화면을 만든다.
// 브라우저(classic script)와 Node(side-effect import) 둘 다에서 globalThis.SFScene 으로 쓴다.
(function (g) {
  "use strict";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const r2 = (n) => Math.round(n * 1000) / 1000;

  // 효과 종류 (편집기 팔레트와 빌드가 함께 씀) — len = 넣을 때 기본 길이(초). 모두 정해진 움직임(무작위 없음)
  const EFFECTS = {
    zoomIn: { label: "줌 인", desc: "천천히 다가감", len: 1.5 },
    zoomOut: { label: "줌 아웃", desc: "가까이서 천천히 물러남", len: 1.2 },
    punch: { label: "펀치 줌", desc: "툭 확대한 채 유지 (점프 컷)", len: 1.0 },
    punchOut: { label: "펀치 아웃", desc: "확대된 화면이 툭 작아짐", len: 0.6 },
    slowPush: { label: "슬로우 푸시", desc: "아주 천천히 다가감 (길게)", len: 4 },
    snapZoom: { label: "스냅 줌", desc: "빠르게 확대했다 돌아옴", len: 0.8 },
    doublePunch: { label: "더블 펀치", desc: "툭, 툭 두 번 다가감", len: 1.0 },
    crash: { label: "크래시 줌", desc: "확 다가가며 하얗게 번쩍", len: 1.0 },
    blurZoom: { label: "블러 줌", desc: "다가가며 흐려졌다 선명해짐", len: 0.9 },
    rotateZoom: { label: "회전 줌", desc: "살짝 돌면서 다가감", len: 1.2 },
    bounceZoom: { label: "바운스 줌", desc: "통통 튀며 확대", len: 1.0 },
    heartbeat: { label: "하트비트", desc: "두근두근 두 번", len: 0.8 },
    zoomHold: { label: "줌 인 홀드", desc: "빠르게 확대한 뒤 그대로", len: 1.5 },
    zoomReveal: { label: "줌 아웃 리빌", desc: "꽉 찬 화면에서 넓게 보여 줌", len: 1.4 },
    kenBurns: { label: "켄 번즈", desc: "천천히 확대하며 옆으로 흐름", len: 3 },
    panLR: { label: "좌우 팬", desc: "왼쪽에서 오른쪽으로 훑음", len: 2 },
    tiltUD: { label: "위아래 틸트", desc: "위에서 아래로 훑음", len: 2 },
    dutch: { label: "더치 틸트", desc: "화면이 비스듬히 기울어짐", len: 1.2 },
    shake: { label: "흔들림", desc: "짧게 흔들림", len: 0.4 },
    handheld: { label: "손떨림", desc: "들고 찍은 듯 잔잔히 흔들림", len: 3 },
    flash: { label: "하얀 번쩍", desc: "화면이 하얗게 번쩍", len: 0.4 },
    dipBlack: { label: "암전 깜빡", desc: "잠깐 까매졌다 돌아옴", len: 0.5 },
    bw: { label: "흑백", desc: "그 구간만 흑백 화면", len: 1.5 },
    spotlight: { label: "스포트라이트", desc: "가장자리가 어두워지고 중심만 밝게", len: 2.5 },
  };

  // 자막 · 훅 모션 (룩과 따로 고른다)
  const CAPTION_MOTIONS = {
    none: { label: "없음", desc: "바로 나타남", fit: "말이 빠르고 자막이 많을 때, 담백한 설명", group: "기본" },
    pop: { label: "팝", desc: "톡 튀어나옴", fit: "짧은 말, 가볍게 톡톡 넘길 때", group: "기본" },
    rise: { label: "아래에서 올라옴", desc: "아래에서 스윽", fit: "차분한 설명 · 이야기 흐름", group: "기본" },
    typing: { label: "타자", desc: "글자 하나씩", fit: "질문 · 생각 · 대화창 느낌", group: "감성" },
    words: { label: "낱말 하나씩", desc: "낱말마다 톡톡", fit: "말 속도에 맞춰 또박또박", group: "통통 귀여움" },
    bounce: { label: "튕김", desc: "위에서 떨어져 통통", fit: "질문 · 재밌는 반응 · 귀여운 톤", group: "통통 귀여움" },
    blur: { label: "흐림에서 선명", desc: "흐릿하다 또렷하게", fit: "감성 · 회상 · 분위기 전환", group: "감성" },
    emphasis: { label: "강조어만 툭", desc: "**강조** 글자만 커짐", fit: "핵심 낱말 하나를 꽂을 때", group: "강렬 예능" },
    marker: { label: "형광펜 칠", desc: "강조어에 형광펜이 칠해짐", fit: "정보 · 꿀팁 · 숫자 강조", group: "정보" },
    karaoke: { label: "카라오케", desc: "말하는 낱말이 색으로 채워짐", fit: "말하는 낱말을 따라 읽게 할 때", group: "정보" },
    shakeIn: { label: "흔들리며 등장", desc: "부르르 떨며 나타남", fit: "놀람 · 경고 · 반전", group: "강렬 예능" },
    zoomSettle: { label: "확대 후 제자리", desc: "크게 나왔다 제자리로", fit: "결론 · 한마디 정리", group: "강렬 예능" },
    slide: { label: "옆에서 밀려옴", desc: "왼쪽에서 쓱", fit: "순서 · 목록 · 다음 이야기", group: "기본" },
    flip: { label: "뒤집혀 등장", desc: "아래로 접혔다 펴짐", fit: "전환 · 「사실은」 뒤집기", group: "감성" },
    slam: { label: "쾅", desc: "크게 떨어져 박힘", fit: "훅 · 강한 주장 · 강조 역할", group: "강렬 예능" },
    // 글자 · 낱말 · 줄이 따로 움직이는 것 (모두 정해진 순서, 끝나면 제자리)
    jelly: { label: "젤리 글자", desc: "글자마다 말랑하게 늘었다 튕김", fit: "귀여운 말투 · 반응", group: "통통 귀여움" },
    bounceRhythm: { label: "통통 리듬", desc: "글자가 하나씩 통통 내려앉음", fit: "신나는 소개 · 리듬감", group: "통통 귀여움" },
    colorIn: { label: "색 입히기", desc: "회색 글자가 차례로 제 색으로", fit: "깨달음 · 「그래서」 정리", group: "감성" },
    weightWave: { label: "굵기 물결", desc: "글자마다 굵어졌다 돌아옴", fit: "강조 문장 · 박자감", group: "강렬 예능" },
    widthWave: { label: "폭 물결", desc: "가운데부터 자간이 모이며 나타남", fit: "감성 · 제목 같은 한 줄", group: "감성" },
    flicker: { label: "깜빡 켜짐", desc: "낱말마다 형광등처럼 깜빡", fit: "반전 · 밤 · 강렬한 한마디", group: "강렬 예능" },
    boxUnfold: { label: "상자 펼치기", desc: "상자가 옆으로 펼쳐지고 글자가 올라옴", fit: "정보 · 목록 · 단계", group: "정보" },
    landSquash: { label: "착지 스쿼시", desc: "떨어져 한 번 눌렸다 튐", fit: "귀여운 강조 · 반응", group: "통통 귀여움" },
    cardFlip: { label: "카드 뒤집기", desc: "줄마다 카드처럼 뒤집히며 등장", fit: "정보 · 차례 · 전환", group: "정보" },
    lineRise: { label: "줄마다 올라오기", desc: "보이지 않는 틀 아래에서 줄마다", fit: "두 줄 설명 · 차분한 정리", group: "기본" },
    dropDown: { label: "위에서 내려오기", desc: "줄마다 위에서 툭 내려옴", fit: "새 주제 · 다음 이야기", group: "기본" },
    swap: { label: "같은 자리 바꿔 끼우기", desc: "강조 칸의 낱말이 차례로 바뀜 (**허리/목/어깨**)", fit: "증상 · 메뉴 나열 · 문제→해결", group: "정보" },
    wipe: { label: "왼쪽부터 닦아 나타나기", desc: "왼쪽에서 오른쪽으로 쓱 드러남", fit: "차분한 설명 · 감성 문장", group: "감성" },
    stopMotion: { label: "스톱모션 붙이기", desc: "낱말이 종이 조각처럼 탁탁 놓임", fit: "공방 · 빵집 · 수제 · 아이 대상", group: "통통 귀여움" },
    outlineFill: { label: "외곽선에서 채우기", desc: "빈 테두리 글자에 아래부터 색이 차오름", fit: "훅 제목 · 결론 한 줄", group: "강렬 예능" },
    searchBar: { label: "검색창 타이핑", desc: "검색창에 글자가 쳐지고 검색 눌림", fit: "「이거 검색해 보셨죠?」 정보형", group: "정보", hookOnly: 1 },
    chatStack: { label: "말풍선 톡톡 쌓기", desc: "질문 말풍선이 줄마다 쌓여 올라옴", fit: "환자 · 손님이 자주 묻는 질문", group: "통통 귀여움", hookOnly: 1 },
    stompWords: { label: "한 단어씩 화면 가득", desc: "낱말마다 크게 한 장씩 찍힌 뒤 전체", fit: "광고 첫 3초 · 강한 한마디", group: "강렬 예능", hookOnly: 1 },
    numberRoll: { label: "숫자 굴리기", desc: "숫자가 0부터 굴러 올라가 멈춤", fit: "숫자 역할 · 가격 · 기간 · 횟수", group: "숫자" },
  };

  // 기본 편집 틀 (레이아웃)
  const LAYOUTS = {
    full: { label: "전체 화면", desc: "영상이 화면 가득 + 아래 자막", fit: "얼굴 · 표정이 중요한 말하기" },
    split: { label: "반반 컷", desc: "위 절반 = 글자 · 그림판, 아래 = 얼굴", fit: "설명 · 순서 · 자료 보여 주기 (구간마다 켜고 끔)" },
    titleBand: { label: "위 제목 띠", desc: "위에 제목 띠 고정 + 아래 영상", fit: "시리즈 · 주제를 계속 보여 줄 때" },
    card: { label: "글자 카드", desc: "구간마다 글자 전면 카드", fit: "정리 · 숫자 · 목차 · 끝인사" },
  };
  const PANEL_TRANS = { slide: "위에서 내려옴", fade: "서서히", pop: "톡 커지기", cut: "바로", colorWipe: "색면 와이프", lightLeak: "빛 띠 지나가기" };
  // 자막 역할마다 효과음 제안
  const SFX_SUGGEST = { emphasis: "impact-bass-1", number: "click", question: "ping", ending: "chime" };

  const MOTION_GROUPS = ["기본", "통통 귀여움", "강렬 예능", "감성", "정보", "숫자"];
  // 나갈 때 (자막 · 훅)
  const EXITS = { none: "없음 (바로)", up: "위로 빠지기", scatter: "조각 흩어지기", fade: "페이드" };
  // 글자(.sf-c) 단위로 나눠야 하는 모션
  const CHAR_MOTIONS = { typing: 1, jelly: 1, bounceRhythm: 1, weightWave: 1, searchBar: 1 };

  // 장면 컷(insert) 전환 · 스티커 계속 움직임
  const INSERT_TRANS = { cut: "컷 (바로)", fade: "페이드", zoom: "살짝 확대", colorWipe: "색면 와이프", lightLeak: "빛 띠 지나가기" };
  const TRANS_INFO = {
    cut: { desc: "바로 바뀜", fit: "빠른 말 · 리듬" }, fade: { desc: "서서히 겹쳐 바뀜", fit: "차분한 전환" }, zoom: { desc: "살짝 확대되며 바뀜", fit: "장면 컷" },
    slide: { desc: "위에서 내려옴", fit: "반반 컷 패널" }, pop: { desc: "톡 커지며 나타남", fit: "정보 카드" },
    colorWipe: { desc: "브랜드색 면이 화면을 쓸고 지나감", fit: "주제 전환 · 단계 설명" },
    lightLeak: { desc: "따뜻한 빛 띠가 쓸고 지나감 (번짐 없음)", fit: "감성 · 회상 · 카페 · 뷰티" },
  };
  const STICKER_IDLE = { none: "멈춤", float: "둥실 (위아래)", wiggle: "흔들흔들 (좌우)", pulse: "두근 (커졌다 작아짐)", hop: "콩콩 (뛰기)" };

  // 아이콘 종류
  const OVERLAY_KINDS = {
    "folder-burst": { label: "폴더 (종이 흩어짐)" },
    terminal: { label: "터미널" },
    emoji: { label: "이모지 카드" },
    title: { label: "위 글자 (띠)" },
    headline: { label: "위 큰 두 줄 글자" },
    chapter: { label: "챕터 라벨" },
    app: { label: "앱 아이콘 타일 (기울임)" },
    bubble: { label: "말풍선 스티커" },
    quiz: { label: "객관식 화면 (목업)" },
    aside: { label: "어사이드 사이드 창 (위아래 분할)" },
    screen: { label: "화면 녹화 (전체 화면)" },
    card: { label: "자료 카드 (캡처 이미지 + 출처 + 빨간 동그라미)" },
    wflist: { label: "어사이드 창 · 추천 워크플로 6개 (분할)" },
    dm: { label: "끝 행동 · 팔로우 · 댓글 · DM 프롬프트 (분할)" },
    insert: { label: "장면 컷 끼우기 (다른 영상, 화면 전체)" },
    sticker: { label: "이미지 스티커 (투명 PNG · 캐릭터)" },
    chat: { label: "메신저 대화 (말풍선이 톡톡 쌓임)" },
  };

  // 글자처럼 가운데 기준으로 놓는 종류 (sticker 도 가운데 기준)
  const TEXT_KINDS = { title: 1, headline: 1, chapter: 1, bubble: 1, quiz: 1 };
  const CENTER_KINDS = Object.assign({ sticker: 1 }, TEXT_KINDS);
  const isTextKind = (k) => !!TEXT_KINDS[k];
  const isCentered = (k) => !!CENTER_KINDS[k];

  // ── 글꼴 (모두 재배포 가능한 OFL. 파일은 스킬 tools/editor/fonts/ → 컴포지션 fonts/ 로 복사됨) ──
  const FONTS = [
    { family: "BlackHanSans", file: "BlackHanSans-Regular.ttf" },
    { family: "Jua", file: "Jua-Regular.ttf" },
    { family: "DoHyeon", file: "DoHyeon-Regular.ttf" },
    { family: "GowunDodum", file: "GowunDodum-Regular.ttf" },
    { family: "NanumPenScript", file: "NanumPenScript-Regular.ttf" },
  ];
  const FONT_OPTIONS = {
    Pretendard: "프리텐다드 (깔끔한 고딕)", BlackHanSans: "검은고딕 (굵은 예능)", Jua: "주아 (동글동글)",
    DoHyeon: "도현 (신문 제목)", GowunDodum: "고운돋움 (담백)", NanumPenScript: "나눔손글씨 펜",
  };
  // 룩 꾸밈 (fx): 글자 모양을 크게 바꾸는 장치
  const LOOK_FX = { none: "없음", sticker: "스티커 이중 테두리", gradient: "그라데이션 글자", chrome: "크롬 · 메탈", tape: "테이프 자막바", pill: "타원 자막바",
    quote: "큰 따옴표 인용", twoTier: "2단 크기 대비", chips: "컬러 칩 키워드", neonHard: "선명 네온", block3d: "굵은 블록 그림자",
    rail: "가로 띠 레일", washi: "한지 띠", chalk: "칠판", receipt: "영수증" };
  const LOOK_GROUPS = ["블록", "스티커", "그라데이션", "예능", "감성", "정보"];
  const EM_MODES = { color: "색만", marker: "형광펜 띠", box: "강조 칩", underline: "밑줄", big: "크게", stroke: "외곽선 색", circle: "손그림 동그라미", dots: "방점 찍기", brackets: "모서리 괄호 조준", stamp: "낙관 도장" };
  // 강조 방식 · 효과 카드에 쓰는 설명과 「어울리는 곳」
  const EM_INFO = {
    color: { desc: "강조 낱말 색만 바꿈", fit: "어디에나 무난, 자막이 많을 때" },
    marker: { desc: "강조 낱말 밑에 형광펜", fit: "정보 · 꿀팁 · 공부 느낌" },
    box: { desc: "강조 낱말을 색 상자에", fit: "핵심 키워드 · 숫자 · 가격" },
    big: { desc: "강조 낱말만 크게", fit: "한 낱말을 크게 꽂을 때" },
    underline: { desc: "강조 낱말에 색 밑줄", fit: "담백한 설명 · 메모 느낌" },
    circle: { desc: "강조 낱말 둘레에 펜 동그라미가 그려짐", fit: "핵심 증상 · 가격 · 「여기!」" },
    dots: { desc: "강조 낱말 위에 점이 톡톡 찍힘", fit: "한의원 · 공부 · 차분한 강조" },
    brackets: { desc: "네 모서리 꺾쇠가 날아와 조여짐", fit: "진단명 · 수치 · 전문 정보" },
    stamp: { desc: "빨간 도장이 살짝 기울어 쾅", fit: "「원장 추천」 · 판정 (전후 비교 · 인증처럼 쓰지 않기)" },
    stroke: { desc: "강조 낱말 테두리 색", fit: "예능 · 굵은 외곽선 자막과 함께" },
  };
  const EFFECT_FIT = {
    zoomIn: "중요한 말 시작할 때", zoomOut: "말을 정리 · 여유", punch: "말 끊김 없이 컷 바꾼 느낌", punchOut: "「그런데」 · 반전 직후",
    slowPush: "진지한 이야기 · 고백", snapZoom: "놀람 한 번", doublePunch: "「진짜요, 진짜」 두 번 강조", crash: "훅 · 충격 · 반전",
    blurZoom: "장면 전환 · 회상", rotateZoom: "역동적인 시작", bounceZoom: "귀여운 반응", heartbeat: "설렘 · 긴장",
    zoomHold: "핵심 한 문장 내내", zoomReveal: "공간 · 결과 보여 주기", kenBurns: "사진 · 정적인 화면 살리기", panLR: "넓은 장면 훑기",
    tiltUD: "전신 · 세로로 긴 것 보여 주기", dutch: "엉뚱함 · 불안 · 예능", shake: "놀람 · 쾅 소리와 함께", handheld: "브이로그 · 현장감",
    flash: "컷 전환 · 사진 찍는 느낌", dipBlack: "장 바뀜 · 시간 흐름", bw: "회상 · 「예전엔」", spotlight: "결정적 한마디 · 진지한 말",
  };
  const ROLES = { normal: "일반", emphasis: "강조", question: "질문", number: "숫자", ending: "마무리" };
  const SPEEDS = { fast: "빠르게", normal: "보통", slow: "느리게" };
  const SPEED_K = { fast: 0.6, normal: 1, slow: 1.6 };
  const ALIGNS = { center: "가운데", left: "왼쪽", right: "오른쪽" };

  // ── 스타일 값 ──
  // 화면에 그리는 것은 모두 이 값으로 한다. 프리셋(STYLE_PRESETS)은 값을 채워 주는 「시작점」일 뿐.
  // 우선순위(자막): BASE.cap → style.cap(전체) → style.roles[역할] → 예전 자막 칸(size·color·motion·y) → caption.look(이 자막만)
  const BASE = {
    // 새 프로젝트 기본값 = 「블랙 블록」: 줄마다 글자에 딱 맞는 검정 상자 + 흰 글자 + 노랑 강조, 번짐 없음
    cap: { font: "Pretendard", weight: 800, size: 66, color: "#ffffff", tracking: -0.04, lineHeight: 1.16,
      boxOn: true, boxColor: "#0a0a0a", boxOpacity: 0.92, radius: 0, pad: 28,
      strokeColor: "#000000", strokeWidth: 0, shadowOn: false, shadowColor: "#0000008c", shadowY: 4,
      emMode: "color", emColor: "#e9ed12", emTextColor: "", motion: "rise", speed: "normal", delay: 0, exit: "none",
      y: 1300, align: "center", maxWidth: 860, fx: "none", fxColor: "#2f7bff", gradA: "#ffb347", gradB: "#ff4f9a", nametag: "" },
    head: { font: "Pretendard", weight: 900, size: 118, color: "#ffffff", tracking: -0.04, lineHeight: 1.14,
      boxOn: true, boxColor: "#0a0a0a", boxOpacity: 0.92, radius: 0, pad: 36,
      strokeColor: "#000000", strokeWidth: 0, shadowOn: false, shadowColor: "#0000008c", shadowY: 5,
      emMode: "color", emColor: "#e9ed12", emTextColor: "", motion: "pop", speed: "normal", delay: 0, exit: "none",
      y: 420, align: "center", maxWidth: 900, fx: "none", fxColor: "#2f7bff", gradA: "#ffb347", gradB: "#ff4f9a", nametag: "" },
    bubble: { font: "Pretendard", weight: 900, color: "#111111", boxColor: "#ffffff", strokeColor: "#111111", strokeWidth: 5 },
    chapter: { font: "Pretendard", weight: 800, color: "#ffffff", boxColor: "#111111", radius: 0, pad: 34 },
  };
  // 편집기 칸 목록: [묶음, 키, 이름, 종류, 선택지/범위]
  const VALUE_FIELDS = [
    ["글자", "font", "글꼴", "select", FONT_OPTIONS],
    ["글자", "weight", "굵기", "select", { 400: "보통", 500: "조금 굵게", 700: "굵게", 800: "더 굵게", 900: "가장 굵게" }],
    ["글자", "size", "크기", "number", [20, 220, 1]],
    ["글자", "color", "글자색", "color"],
    ["글자", "tracking", "자간", "range", [-0.1, 0.2, 0.005]],
    ["글자", "lineHeight", "줄 간격", "range", [0.9, 1.8, 0.05]],
    ["상자", "boxOn", "상자", "toggle"],
    ["상자", "boxColor", "상자색", "color"],
    ["상자", "boxOpacity", "상자 진하기", "range", [0, 1, 0.05]],
    ["상자", "radius", "모서리 둥글기", "number", [0, 80, 1]],
    ["상자", "pad", "안쪽 여백 (옆)", "number", [0, 80, 1]],
    ["상자", "strokeColor", "외곽선 색", "color"],
    ["상자", "strokeWidth", "외곽선 두께", "number", [0, 30, 1]],
    ["상자", "shadowOn", "그림자", "toggle"],
    ["상자", "shadowColor", "그림자 색", "color"],
    ["상자", "shadowY", "그림자 거리", "number", [0, 14, 1]],
    ["강조", "emMode", "강조 방식", "select", EM_MODES],
    ["강조", "emColor", "강조색", "color"],
    ["강조", "emTextColor", "강조 글자색 (칩 · 띠)", "color"],
    ["모션", "motion", "모션", "select", null],
    ["모션", "speed", "속도", "select", SPEEDS],
    ["모션", "delay", "지연 (초)", "number", [0, 2, 0.05]],
    ["모션", "exit", "나갈 때", "select", EXITS],
    ["위치", "y", "세로 위치", "number", [0, 1920, 1]],
    ["위치", "align", "정렬", "select", ALIGNS],
    ["위치", "maxWidth", "한 줄 최대 폭", "number", [300, 1060, 10]],
    ["꾸밈", "fx", "꾸밈", "select", LOOK_FX],
    ["꾸밈", "fxColor", "꾸밈 색", "color"],
    ["꾸밈", "gradA", "그라데이션 위", "color"],
    ["꾸밈", "gradB", "그라데이션 아래", "color"],
    ["꾸밈", "nametag", "이름표 (비우면 없음)", "text"],
  ];
  // 대상마다 보여 줄 칸
  const TARGET_KEYS = {
    cap: VALUE_FIELDS.map((f) => f[1]),
    head: VALUE_FIELDS.map((f) => f[1]),
    bubble: ["font", "weight", "color", "boxColor", "strokeColor", "strokeWidth"],
    chapter: ["font", "weight", "color", "boxColor", "radius", "pad"],
  };

  // 시작점 (프리셋) — 값 묶음. 「불러오기」하면 이 값이 칸에 채워지고, 그다음 전부 고칠 수 있다.
  const P = (label, desc, cap, head, extra) => Object.assign({ label, desc, cap, head }, extra || {});
  const boxCap = (bg, fg, em, more) => Object.assign({ boxOn: true, boxColor: bg, boxOpacity: 1, color: fg, shadowOn: false, emColor: em }, more || {});
  // 셀피쉬 스타일 10개 — 자막 값만 정하고, 훅 제목은 같은 값에서 크기만 키운다
  const H = (cap, more) => Object.assign({}, cap, { size: Math.round((cap.size || 66) * 1.8), y: 420, maxWidth: 900 }, more || {});
  const S10 = (group, label, desc, cap, headMore) => ({ group, label, desc, cap, head: H(cap, headMore), main: 1 });
  const STYLE_PRESETS = {
    blackBlock: S10("블록", "블랙 블록", "검정 상자 · 흰 글자 · 노랑 강조", {}),
    whiteBlock: S10("블록", "화이트 블록", "흰 상자 · 검은 글자 · 노랑 형광 띠", { boxColor: "#ffffff", boxOpacity: 1, color: "#111111", emMode: "marker", emColor: "#e9ed12", emTextColor: "#000000" }),
    neonBlock: S10("블록", "형광 블록", "노랑 상자 · 검은고딕 · 검정 칩 강조", { font: "BlackHanSans", weight: 400, tracking: -0.02, boxColor: "#e9ed12", boxOpacity: 1, color: "#000000", emMode: "box", emColor: "#000000", emTextColor: "#ffffff" }),
    blackKeyword: S10("정보", "블랙 + 노랑 키워드", "검정 상자 · 강조 낱말만 노랑 칩", { weight: 700, boxColor: "#000000", boxOpacity: 1, emMode: "box", emColor: "#e9ed12", emTextColor: "#000000" }),
    cleanWhite: S10("예능", "깔끔 흰 글자", "배경 없음 · 검은 외곽선 · 노랑 강조", { boxOn: false, weight: 800, strokeColor: "#000000", strokeWidth: 6, shadowOn: true, shadowColor: "#0000008c", shadowY: 4, emColor: "#e9ed12" }, { strokeWidth: 10, shadowY: 6 }),
    variety: S10("예능", "예능 굵은 외곽선", "검은고딕 · 두꺼운 검은 외곽선", { boxOn: false, font: "BlackHanSans", weight: 400, tracking: -0.02, strokeColor: "#000000", strokeWidth: 12, shadowOn: true, shadowColor: "#000000", shadowY: 5, emColor: "#ffe14d" }, { strokeWidth: 20, shadowY: 8 }),
    paperMemo: S10("감성", "종이 메모", "종이색 상자 · 손글씨 · 주황 밑줄", { font: "NanumPenScript", weight: 400, size: 84, tracking: 0, boxColor: "#f7f4ef", boxOpacity: 1, color: "#1a1a1a", radius: 2, emMode: "underline", emColor: "#d9480f" }),
    roundBubble: S10("스티커", "동글 말풍선", "둥근 흰 상자 · 주아 · 빨강 강조", { font: "Jua", weight: 400, tracking: -0.02, boxColor: "#ffffff", boxOpacity: 1, color: "#111111", radius: 999, pad: 34, emColor: "#ff5a5f" }),
    docu: S10("감성", "다큐 담백", "배경 없음 · 고운돋움 · 작게 · 밑줄", { boxOn: false, font: "GowunDodum", weight: 600, size: 56, tracking: -0.01, lineHeight: 1.2, shadowOn: true, shadowColor: "#00000099", shadowY: 2, emMode: "underline", emColor: "#ffffff" }),
    newspaper: S10("정보", "신문 헤드라인", "흰 상자 · 도현 · 빨강 강조", { font: "DoHyeon", weight: 400, tracking: -0.02, boxColor: "#ffffff", boxOpacity: 1, color: "#000000", emColor: "#e03131" }),
    // ── 더 다양한 룩 13개 ──
    sticker: S10("스티커", "스티커 이중 테두리", "분홍 글자 · 흰 테두리 · 남색 바깥 테두리", { boxOn: false, font: "BlackHanSans", weight: 400, tracking: -0.01, color: "#ff4f8b", strokeColor: "#ffffff", strokeWidth: 14, shadowOn: false, fx: "sticker", fxColor: "#2a1a5e", emColor: "#ffd23f" }, { strokeWidth: 22 }),
    gradSunset: S10("그라데이션", "노을 그라데이션", "주황 → 분홍 글자 · 진한 외곽선", { boxOn: false, font: "BlackHanSans", weight: 400, tracking: -0.01, color: "#ffffff", strokeColor: "#3a1020", strokeWidth: 8, shadowOn: true, shadowColor: "#3a1020", shadowY: 5, fx: "gradient", gradA: "#ffc04d", gradB: "#ff4f9a", emColor: "#fff27a" }, { strokeWidth: 14, shadowY: 8 }),
    gradSoda: S10("그라데이션", "소다 그라데이션", "하늘 → 민트 글자 · 남색 외곽선", { boxOn: false, font: "BlackHanSans", weight: 400, tracking: -0.01, color: "#ffffff", strokeColor: "#0b3a4a", strokeWidth: 8, shadowOn: true, shadowColor: "#0b3a4a", shadowY: 5, fx: "gradient", gradA: "#8fe3ff", gradB: "#5ff0c0", emColor: "#ffffff" }, { strokeWidth: 14, shadowY: 8 }),
    gradCandy: S10("그라데이션", "캔디 그라데이션", "분홍 → 보라 글자 · 보라 외곽선", { boxOn: false, font: "Jua", weight: 400, tracking: -0.01, color: "#ffffff", strokeColor: "#3b1460", strokeWidth: 8, shadowOn: true, shadowColor: "#3b1460", shadowY: 5, fx: "gradient", gradA: "#ffa3d8", gradB: "#9b6bff", emColor: "#fff27a" }, { strokeWidth: 14, shadowY: 8 }),
    chrome: S10("그라데이션", "크롬 · 메탈", "은색 금속 글자 · 검정 외곽선", { boxOn: false, font: "BlackHanSans", weight: 400, tracking: 0, color: "#ffffff", strokeColor: "#000000", strokeWidth: 8, shadowOn: true, shadowColor: "#000000", shadowY: 4, fx: "chrome", emColor: "#ffe14d" }, { strokeWidth: 14 }),
    tape: S10("블록", "테이프 자막바", "기울어 붙은 마스킹테이프 위 글자", { boxOn: true, boxColor: "#f6e7a1", boxOpacity: 0.95, color: "#2b2b2b", weight: 800, fx: "tape", fxColor: "#f6e7a1", emColor: "#d9480f" }),
    pill: S10("블록", "타원 자막바", "알약 모양 노랑 외곽선 + 반투명 채움", { boxOn: true, boxColor: "#000000", boxOpacity: 0.55, color: "#ffffff", radius: 999, pad: 36, fx: "pill", fxColor: "#e9ed12", emColor: "#e9ed12" }),
    nametag: S10("정보", "이름표", "자막 위 작은 이름 칩 (예: 원장님)", { nametag: "원장님" }),
    quote: S10("감성", "큰 따옴표 인용", "앞뒤에 노랑 큰 따옴표", { boxOn: false, font: "GowunDodum", weight: 700, tracking: -0.02, lineHeight: 1.22, color: "#ffffff", shadowOn: true, shadowColor: "#000000b3", shadowY: 3, fx: "quote", emColor: "#ffd23f" }),
    twoTier: S10("정보", "2단 크기 대비", "윗줄 작게 · 아랫줄 큰 키워드", { boxOn: false, font: "BlackHanSans", weight: 400, tracking: -0.01, size: 80, color: "#ffffff", strokeColor: "#000000", strokeWidth: 8, shadowOn: true, shadowColor: "#000000", shadowY: 5, fx: "twoTier", emColor: "#e9ed12" }),
    colorChips: S10("스티커", "컬러 칩 키워드", "강조 낱말마다 노랑 · 하늘 · 분홍 칩", { boxOn: false, weight: 800, color: "#ffffff", strokeColor: "#000000", strokeWidth: 6, shadowOn: true, shadowColor: "#0000008c", shadowY: 4, fx: "chips", emColor: "#e9ed12" }),
    neonHard: S10("그라데이션", "선명 네온", "번짐 없이 여러 겹 단단한 네온 테두리", { boxOn: false, weight: 800, color: "#ffffff", strokeWidth: 0, shadowOn: false, fx: "neonHard", fxColor: "#22e4ff", emColor: "#ff3df2" }),
    rail: S10("정보", "가로 띠 레일", "화면 폭 반투명 검은 띠 + 흰 글자", { boxOn: true, boxColor: "#000000", boxOpacity: 0.62, weight: 700, fx: "rail", emColor: "#e9ed12" }),
    washi: S10("감성", "한지 띠", "해진 가장자리 미색 종이 + 고운돋움 · 먹색 강조", { boxOn: true, boxColor: "#f1e8d6", boxOpacity: 1, font: "GowunDodum", weight: 600, tracking: -0.01, color: "#5a4e40", emColor: "#0d0b09", fx: "washi" }),
    chalk: S10("정보", "칠판", "초록 칠판 + 손글씨 분필 · 노란 분필 강조", { boxOn: true, boxColor: "#1f3b2d", boxOpacity: 1, radius: 4, font: "NanumPenScript", weight: 400, size: 84, tracking: 0, color: "#f4f4ee", emColor: "#ffe066", fx: "chalk", fxColor: "#7a5634" }),
    receipt: S10("정보", "영수증", "흰 감열지 · 톱니 아래 · 점선 · 고정폭 숫자", { boxOn: true, boxColor: "#fbfbf6", boxOpacity: 1, weight: 700, tracking: -0.01, color: "#1a1a1a", emColor: "#d62828", fx: "receipt" }),
    block3d: S10("예능", "굵은 블록 그림자", "글자 뒤로 단색 압출 그림자", { boxOn: false, font: "BlackHanSans", weight: 400, tracking: -0.01, color: "#ffe14d", strokeColor: "#000000", strokeWidth: 5, shadowOn: false, fx: "block3d", fxColor: "#000000", emColor: "#ffffff" }),
    // ── 예전 이름 (예전 edit.json 의 style.preset 을 풀 때만 씀) ──
    neutral: P("예전: 중립", "예전 프리셋", { boxOn: false, shadowOn: true, strokeWidth: 0 }, { boxOn: false, shadowOn: true }, { old: 1 }),
    whiteBox: P("흰 상자", "흰 상자 + 검은 글자", boxCap("#ffffff", "#111214", "#ff5a1f", { radius: 14, pad: 30, shadowOn: true, shadowColor: "#00000055", shadowBlur: 20 }),
      { color: "#111214", strokeColor: "#ffffff", strokeWidth: 18, emColor: "#ff5a1f", shadowOn: true, shadowBlur: 18, shadowColor: "#0000004d" }),
    blackBox: P("검은 상자", "검은 상자 + 흰 글자", boxCap("#0b0b0c", "#ffffff", "#ffd23f", { radius: 0, pad: 36, weight: 600 }),
      { strokeColor: "#0b0b0c", strokeWidth: 16, emColor: "#ffd23f" }),
    marker: P("노랑 형광펜 밑줄", "강조어 밑에 형광펜", { weight: 800, strokeColor: "#111111", strokeWidth: 5, emMode: "marker", emColor: "#ffe14d", shadowBlur: 8 },
      { strokeColor: "#111111", strokeWidth: 14, emMode: "marker", emColor: "#ffe14d" }, { old: 1 }),
    talk: P("둥근 말풍선 자막", "둥근 흰 상자", boxCap("#ffffff", "#111214", "#2f7bff", { radius: 60, pad: 40, weight: 700 }),
      { font: "Jua", weight: 400, color: "#111214", boxOn: true, boxColor: "#ffffff", boxOpacity: 1, radius: 90, pad: 50, shadowOn: true, shadowBlur: 20, shadowColor: "#00000040", emColor: "#2f7bff" }),
    minimal: P("투명 그림자 미니멀", "얇은 글자 + 부드러운 그림자", { weight: 500, tracking: -0.02, shadowBlur: 14, shadowColor: "#0000008c", emMode: "color", emColor: "#9be7ff" },
      { weight: 700, tracking: -0.03, shadowBlur: 26, shadowColor: "#0000008c", emColor: "#9be7ff" }, { old: 1 }),
    pastel: P("파스텔 귀여움", "분홍 상자 + 동글 글꼴", boxCap("#ffd6e7", "#5a2a4a", "#7b5cff", { font: "Jua", weight: 400, radius: 40, pad: 34 }),
      { font: "Jua", weight: 400, strokeColor: "#ff8fb8", strokeWidth: 16, emColor: "#fff6a8" }),
    news: P("신문", "누런 종이 상자", boxCap("#f6f1e4", "#141414", "#d62828", { font: "DoHyeon", weight: 400, tracking: 0, radius: 0, pad: 34 }),
      { font: "DoHyeon", weight: 400, tracking: 0, color: "#141414", boxOn: true, boxColor: "#f6f1e4", boxOpacity: 1, radius: 0, pad: 40, emColor: "#d62828" }),
    neon: P("네온", "빛나는 글자", { weight: 800, shadowOn: true, shadowColor: "#22e4ff", shadowBlur: 30, emColor: "#22e4ff" },
      { shadowOn: true, shadowColor: "#22e4ff", shadowBlur: 40, emColor: "#ff3df2" }, { old: 1 }),
    handwrite: P("손글씨 느낌", "펜으로 쓴 듯한 글꼴", { font: "NanumPenScript", weight: 400, tracking: 0, size: 88, shadowBlur: 8, emColor: "#ffe14d" },
      { font: "NanumPenScript", weight: 400, tracking: 0, size: 150, emColor: "#ffe14d" }, { old: 1 }),
    keyword: P("키워드 크게", "강조어만 크게", { strokeColor: "#111111", strokeWidth: 4, emMode: "big", emColor: "#ffe14d" },
      { strokeColor: "#111111", strokeWidth: 12, emMode: "big", emColor: "#ffe14d" }, { old: 1 }),
    tag: P("형광 띠지", "형광 상자 + 검은 글자", boxCap("#c6ff3d", "#111111", "#ffffff", { radius: 0, pad: 28, weight: 800, emMode: "stroke", strokeColor: "#111111" }),
      { color: "#111111", boxOn: true, boxColor: "#c6ff3d", boxOpacity: 1, radius: 0, pad: 26, emMode: "stroke", emColor: "#ffffff", strokeColor: "#111111" }),
    outline: P("깔끔 외곽선", "흰 글자 + 검은 테두리", { weight: 800, strokeColor: "#000000", strokeWidth: 8, shadowOn: false, emColor: "#ffd23f" },
      { strokeColor: "#000000", strokeWidth: 16, emColor: "#ffd23f" }, { old: 1 }),
    gradient: P("보라 상자", "보라 상자 + 노랑 강조", boxCap("#7b5cff", "#ffffff", "#fff36b", { radius: 18, pad: 30 }),
      { strokeColor: "#3b1d8f", strokeWidth: 16, emColor: "#fff36b" }),
    // 예전 편집기 프리셋 이름 (예전 edit.json 의 style.preset 을 풀 때 씀)
    momdi: P("예전: 검은 상자 + 하늘색 챕터", "예전 프리셋", boxCap("#0b0b0c", "#ffffff", "#ffd23f", { radius: 0, pad: 40, weight: 500 }),
      { strokeColor: "#1d2a44", strokeWidth: 6, emColor: "#ff6a3d", weight: 800 }, { old: 1, chapter: { color: "#0b0b0c", boxColor: "#5cc8fb" }, bubble: { boxColor: "#cfeeff" } }),
    clean: P("예전: 흰 상자 + 얇은 테두리", "예전 프리셋", boxCap("#ffffff", "#111214", "#ffe14d", { radius: 10, pad: 36, weight: 600, emMode: "marker" }),
      { color: "#111214", strokeColor: "#ffffff", strokeWidth: 20, emColor: "#ff5a1f" }, { old: 1 }),
    highlight: P("예전: 굵은 흰 글자 + 노랑 강조", "예전 프리셋", { weight: 900, tracking: -0.04, emColor: "#ffe14d" },
      { strokeColor: "#ffb800", strokeWidth: 24, emColor: "#ffe14d" }, { old: 1, bubble: { boxColor: "#ffe14d" } }),
    basic: P("예전: 기본", "예전 프리셋", { emColor: "#ffd23f", motion: "none" }, { emColor: "#ffd23f" }, { old: 1 }),
    zemma: P("예전: 흰 상자 검정 자막", "예전 프리셋", boxCap("#ffffff", "#111214", "#ff5a1f", { radius: 14, pad: 34, weight: 600 }),
      { strokeColor: "#111214", strokeWidth: 24, emColor: "#ffe14d" }, { old: 1, chapter: { color: "#111214", boxColor: "#7fe3f5" } }),
  };
  // 예전 이름은 고르기 목록에 안 보이게
  for (const [k, v] of Object.entries(STYLE_PRESETS)) if (!v.main) v.old = 1;
  const presetOf = (id) => STYLE_PRESETS[id] || STYLE_PRESETS.blackBlock;

  function fontFaces(base) {
    const b = base || "";
    return `@font-face{font-family:"GmarketSans";src:url("${b}fonts/GmarketSansBold.otf") format("opentype");font-weight:700}` +
      FONTS.map((f) => `@font-face{font-family:"${f.family}";src:url("${b}fonts/${f.file}") format("truetype");font-weight:400 900}`).join("");
  }

  // #rrggbb(aa) + 진하기 → rgba
  function rgba(hex, a) {
    const h = String(hex || "#000").replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
    const n = (i) => parseInt(full.slice(i, i + 2), 16) || 0;
    const a0 = full.length >= 8 ? n(6) / 255 : 1;
    return `rgba(${n(0)},${n(2)},${n(4)},${r2(a0 * (a ?? 1))})`;
  }
  const isLight = (hex) => {
    const h = String(hex || "#000").replace("#", "");
    const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const v = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
    return v[0] * 0.299 + v[1] * 0.587 + v[2] * 0.114 > 150;
  };

  // 값 → CSS. sel = 바깥 요소(자막 div · 훅 div), inner = 글자 상자(.sf-cl · .sf-head)
  // 글자 배경이 없는데 글자가 어두우면 영상 위에서 안 보임 → 흰 글자 + 검은 외곽선으로 (밝은 외곽선을 일부러 준 경우는 그대로)
  function readable(v0) {
    const v = Object.assign({}, v0);
    if (!v.boxOn && !isLight(v.color) && !(v.strokeWidth >= 4 && isLight(v.strokeColor))) {
      v.color = "#ffffff";
      v.strokeColor = "#000000";
      v.strokeWidth = Math.max(5, v.strokeWidth || 0);
    }
    return v;
  }
  // 값 → CSS. sel = 바깥 요소(자막 div · 훅 div), inner = 글자 묶음(.sf-cl · .sf-head). 줄마다 .sf-ln 이 따로 상자를 가짐
  // 규칙: 번짐 없음(그림자는 번짐 0) · 배경 있으면 외곽선 · 그림자 없음 · 상자는 줄마다 글자 폭만큼 · 줄 사이 5px
  function valuesCSS(sel, v0, inner) {
    const v = readable(v0);
    const I = `${sel} ${inner}`;
    const L = `${I} .sf-ln`;
    const sh = !v.boxOn && v.shadowOn ? `0 ${v.shadowY ?? 4}px 0 ${rgba(v.shadowColor)}` : "none";
    const stroke = !v.boxOn && v.strokeWidth > 0 ? `${v.strokeWidth}px ${v.strokeColor}` : "0";
    let css = `${sel}{font-family:'${v.font}','Pretendard',sans-serif;font-weight:${v.weight};letter-spacing:${v.tracking}em;text-align:${v.align};text-shadow:${sh}}`;
    css += `${I}{color:${v.color};line-height:0;background:none;padding:0;-webkit-text-stroke:${stroke};paint-order:stroke fill}`;
    css += `${L}{display:inline-block;vertical-align:top;line-height:${v.lineHeight};margin:0 0 5px;` +
      (v.boxOn ? `background:${rgba(v.boxColor, v.boxOpacity)};border-radius:${v.radius}px;padding:${r2(v.pad * 0.38)}px ${v.pad}px` : `background:none;padding:0`) + `}`;
    const E = `${I} em`;
    const emText = v.emTextColor || (isLight(v.emColor) ? "#000000" : "#ffffff");
    if (v.emMode === "marker") css += `${E}{color:${v.emTextColor || "inherit"};background:linear-gradient(transparent 52%,${v.emColor} 52%,${v.emColor} 94%,transparent 94%);padding:0 .06em}`;
    else if (v.emMode === "box") css += `${E}{background:${v.emColor};color:${emText};padding:0 .14em;border-radius:${Math.min(v.radius, 8)}px;-webkit-text-stroke:0;-webkit-box-decoration-break:clone;box-decoration-break:clone}`;
    else if (v.emMode === "underline") css += `${E}{color:${v.emColor};text-decoration:underline;text-decoration-color:${v.emColor};text-decoration-thickness:.08em;text-underline-offset:.12em}`;
    else if (v.emMode === "big") css += `${E}{font-size:calc(var(--emk,1) * 1.3em);color:${v.emColor}}`;
    else if (v.emMode === "stroke") css += `${E}{-webkit-text-stroke:${Math.max(6, v.strokeWidth)}px ${v.emColor}}`;
    else if (v.emMode === "circle") css += `${E}{color:${v.emColor};position:relative}${E} .sf-circ{position:absolute;left:-14%;top:-30%;width:128%;height:160%;overflow:visible;pointer-events:none}${E} .sf-circ path{fill:none;stroke:${v.emColor};stroke-width:5px;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}`;
    else if (v.emMode === "dots") css += `${E}{color:${v.emColor}}${E} .sf-w{-webkit-text-emphasis:filled dot var(--dc,transparent);text-emphasis:filled dot var(--dc,transparent);-webkit-text-emphasis-position:over right;text-emphasis-position:over right}` +
      (v.boxOn ? `${I} .sf-ln:has(em){padding-top:calc(${r2(v.pad * 0.38)}px + .42em)}` : `${I} .sf-ln:has(em){margin-top:.42em}`);
    else if (v.emMode === "brackets") css += `${E}{color:${v.emColor};position:relative;margin:0 .14em}${E} .sf-brk{position:absolute;width:.3em;height:.3em;border:0 solid ${v.emColor};pointer-events:none}` +
      `${E} .b1{left:-.13em;top:.02em;border-top-width:.07em;border-left-width:.07em}${E} .b2{right:-.13em;top:.02em;border-top-width:.07em;border-right-width:.07em}` +
      `${E} .b3{left:-.13em;bottom:.02em;border-bottom-width:.07em;border-left-width:.07em}${E} .b4{right:-.13em;bottom:.02em;border-bottom-width:.07em;border-right-width:.07em}`;
    else if (v.emMode === "stamp") css += `${E}{display:inline-block;color:#c8231d;background:#fff6ee;border:.07em solid #c8231d;padding:0 .12em;margin:0 .14em;rotate:-3deg;line-height:1.08;-webkit-text-stroke:0;text-shadow:none;font-weight:900}`;
    else css += `${E}{color:${v.emColor}}`;
    css += `${I} .sf-mk{background:${v.emColor}}${I} .sf-kf{color:${v.emColor}}`;
    css += fxCSS(sel, I, L, v);
    // 외곽선에서 채우기: 빈 테두리 글자 + 아래부터 차오르는 같은 글자(.sf-kf)
    const OF = `${sel}.sf-mo-outlineFill`;
    css += `${OF}{text-shadow:none}${OF} .sf-w{color:transparent;-webkit-text-stroke:3px ${v.color}}${OF} em .sf-w{-webkit-text-stroke-color:${v.emColor}}` +
      `${OF} .sf-kf{color:${v.color};-webkit-text-stroke:0}${OF} em .sf-kf{color:${v.emColor}}`;
    return css;
  }
  // 꾸밈(fx) CSS — 모두 번짐 0
  const ring = (r, c, n) => Array.from({ length: n }, (_, i) => { const a = (Math.PI * 2 * i) / n; return `${r2(Math.cos(a) * r)}px ${r2(Math.sin(a) * r)}px 0 ${c}`; });
  function fxCSS(sel, I, L, v) {
    const fx = v.fx || "none";
    let c = "";
    const W = `${I} .sf-w`;
    if (fx === "gradient" || fx === "chrome") {
      const g = fx === "chrome" ? "linear-gradient(180deg,#ffffff 0%,#e3e6ea 38%,#8d939c 52%,#eef0f3 68%,#a2a8b1 100%)" : `linear-gradient(180deg,${v.gradA} 10%,${v.gradB} 90%)`;
      const ge = fx === "chrome" ? `linear-gradient(180deg,#fff6c2 0%,${v.emColor} 50%,#b38f00 100%)` : `linear-gradient(180deg,#ffffff 0%,${v.emColor} 100%)`;
      // 낱말마다 같은 세로 그라데이션을 글자 모양으로 자름 (외곽선은 진하게, 그림자는 번짐 0)
      c += `${W}{background:${g};-webkit-background-clip:text;background-clip:text;color:transparent;padding:0 .02em}`;
      // 글자 외곽선 · 그림자는 그라데이션 위에 그려져 색을 덮으므로, 줄 바깥에 번짐 0 테두리(drop-shadow 고리) + 그림자로 대신
      const ow = Math.max(2, (v.strokeWidth || 0) * 0.5);
      // 상하좌우 4개만 이어 붙임 (여러 개를 이으면 테두리가 겹겹이 불어나 덩어리가 됨)
      const o4 = r2(ow * 0.6);
      const rings = v.strokeWidth > 0 ? [`${o4}px 0 0`, `-${o4}px 0 0`, `0 ${o4}px 0`, `0 -${o4}px 0`].map((x) => `drop-shadow(${x} ${v.strokeColor})`) : [];
      if (v.shadowOn) rings.push(`drop-shadow(0 ${v.shadowY ?? 4}px 0 ${rgba(v.shadowColor)})`);
      c += `${sel}{text-shadow:none}${I}{-webkit-text-stroke:0}${L}{filter:${rings.join(" ") || "none"}}`;
      c += `${I} em .sf-w{background:${ge};-webkit-background-clip:text;background-clip:text;color:transparent}`;
    } else if (fx === "sticker") {
      // 안쪽 흰 테두리(외곽선) + 바깥 색 테두리(번짐 0 그림자 8방향)
      c += `${L}{filter:${ring(Math.max(4, v.strokeWidth * 0.42), v.fxColor, 8).map((x) => `drop-shadow(${x})`).join(" ")}}`;
    } else if (fx === "neonHard") {
      const sh = [...ring(3, "#ffffff", 8), ...ring(6, v.fxColor, 12), ...ring(9, "#0b0b2a", 12)].join(",");
      c += `${sel}{text-shadow:${sh}}${I} em{text-shadow:${[...ring(3, "#ffffff", 8), ...ring(6, v.emColor, 12), ...ring(9, "#0b0b2a", 12)].join(",")}}`;
      c += `${I}{color:${v.color}}`;
    } else if (fx === "block3d") {
      const sh = Array.from({ length: 7 }, (_, i) => `${i + 1}px ${i + 1}px 0 ${v.fxColor}`).join(",");
      c += `${sel}{text-shadow:${sh}}`;
    } else if (fx === "tape") {
      c += `${L}{background:none;position:relative;isolation:isolate}`;
      c += `${L}::before{content:"";position:absolute;left:-.12em;right:-.12em;top:.08em;bottom:.02em;background:${rgba(v.fxColor, 0.95)};rotate:-1.6deg;z-index:-1;` +
        `clip-path:polygon(0 6%,3% 0,6% 7%,9% 0,100% 0,97% 8%,100% 16%,97% 25%,100% 34%,97% 43%,100% 52%,97% 61%,100% 70%,97% 79%,100% 88%,97% 96%,100% 100%,0 100%,3% 92%,0 84%,3% 76%,0 68%,3% 60%,0 52%,3% 44%,0 36%,3% 28%,0 20%,3% 12%)}`;
    } else if (fx === "pill") {
      c += `${L}{box-shadow:inset 0 0 0 5px ${v.fxColor}}`;
    } else if (fx === "quote") {
      const q = `color:${v.emColor};font-family:'BlackHanSans','Pretendard',sans-serif;font-size:1.5em;line-height:0;vertical-align:-.42em;-webkit-text-stroke:0`;
      c += `${I} .sf-ln:first-of-type::before{content:"“";margin-right:.06em;${q}}${I} .sf-ln:last-of-type::after{content:"”";margin-left:.06em;${q}}`;
    } else if (fx === "twoTier") {
      // 윗줄: 작게 · 다른 글꼴 / 아랫줄: 큰 키워드
      const f2 = v.font === "Pretendard" ? "GowunDodum" : "Pretendard";
      c += `${I} .sf-t1{font-size:.56em;font-family:'${f2}','Pretendard',sans-serif;font-weight:700;letter-spacing:-0.02em;margin-bottom:.12em}`;
    } else if (fx === "rail") {
      // 줄 폭이 아닌 화면 폭 고정 띠 (자막 묶음 전체에 하나)
      c += `${I}{display:inline-block;width:1000px;background:${rgba(v.boxColor, v.boxOpacity)};padding:.3em .3em .18em;box-sizing:border-box}${L}{background:none;padding:0}`;
    } else if (fx === "washi") {
      // 가장자리가 살짝 해진 종이 (정해진 들쭉날쭉 모양)
      c += `${L}{clip-path:polygon(0 4%,2% 0,5% 3%,9% 0,14% 2%,20% 0,27% 3%,35% 0,43% 2%,52% 0,60% 3%,68% 0,76% 2%,84% 0,91% 3%,96% 0,100% 5%,99% 22%,100% 40%,98% 58%,100% 76%,99% 94%,96% 100%,90% 97%,83% 100%,75% 98%,66% 100%,57% 97%,48% 100%,39% 98%,30% 100%,22% 97%,14% 100%,7% 98%,2% 100%,0 95%,1% 78%,0 60%,2% 42%,0 24%)}`;
    } else if (fx === "chalk") {
      c += `${L}{box-shadow:inset 0 0 0 .09em ${v.fxColor}}`;
    } else if (fx === "receipt") {
      // 영수증: 한 장 종이 + 아래 톱니 + 줄 사이 점선 + 고정폭 숫자
      c += `${I}{display:inline-block;background:${rgba(v.boxColor, v.boxOpacity)};padding:.3em .5em .55em;font-variant-numeric:tabular-nums;` +
        `-webkit-mask:linear-gradient(#000,#000) top/100% calc(100% - .2em) no-repeat,conic-gradient(from -45deg at 50% 100%,#0000,#000 1deg 89deg,#0000 90deg) bottom/.4em .2em repeat-x;` +
        `mask:linear-gradient(#000,#000) top/100% calc(100% - .2em) no-repeat,conic-gradient(from -45deg at 50% 100%,#0000,#000 1deg 89deg,#0000 90deg) bottom/.4em .2em repeat-x}`;
      c += `${L}{background:none;padding:.08em 0;margin:0 0 8px}${I} br + .sf-ln{border-top:.05em dashed #9a9a92}`;
    } else if (fx === "chips") {
      const cs = [v.emColor, "#7fd3ff", "#ff8fc8"];
      c += `${I} em{color:#000000;-webkit-text-stroke:0;text-shadow:none}`;
      cs.forEach((col, i) => (c += `${I} em .sf-w:nth-of-type(3n+${i + 1}){background:${col};color:#000000;padding:.02em .16em;margin:0 .03em;-webkit-text-stroke:0}`));
    }
    if (v.nametag) {
      const al = v.align === "left" ? "0 auto .3em 0" : v.align === "right" ? "0 0 .3em auto" : "0 auto .3em";
      c += `${I}::before{content:"${String(v.nametag).replace(/["\\\n]/g, "")}";display:table;margin:${al};font-size:.42em;line-height:1.2;font-family:'Pretendard',sans-serif;font-weight:800;letter-spacing:-0.02em;` +
        `background:${v.emColor};color:${isLight(v.emColor) ? "#000000" : "#ffffff"};padding:.18em .55em;-webkit-text-stroke:0;text-shadow:none;border-radius:2px}`;
    }
    return c;
  }
  function bubbleCSS(sel, v) {
    return `${sel} .sf-bubble path{fill:${v.boxColor};stroke:${v.strokeColor};stroke-width:${v.strokeWidth}}${sel} .sf-bubble b{color:${v.color};font-family:'${v.font}','Pretendard',sans-serif;font-weight:${v.weight}}`;
  }
  function chapterCSS(sel, v) {
    return `${sel} .sf-chapter{background:${v.boxColor};color:${v.color};font-family:'${v.font}','Pretendard',sans-serif;font-weight:${v.weight};border-radius:${v.radius}px;padding:${r2(v.pad * 0.42)}px ${v.pad}px;white-space:nowrap}`;
  }

  // 예전 edit.json(style.preset · captionMotion · accent)을 값으로 풀어 채운다 (한 번만)
  function normalizeStyle(d) {
    const st = d.style || (d.style = {});
    const pr = STYLE_PRESETS[st.preset];
    if (!st.cap) {
      st.cap = Object.assign({}, pr ? pr.cap : {});
      if (st.captionMotion) st.cap.motion = st.captionMotion;
      if (st.accent) st.cap.emColor = st.accent;
    }
    if (!st.head) {
      st.head = Object.assign({}, pr ? pr.head : {});
      if (st.accent) st.head.emColor = st.accent;
    }
    if (!st.bubble) st.bubble = Object.assign({}, pr && pr.bubble);
    if (!st.chapter) st.chapter = Object.assign({}, pr && pr.chapter);
    if (!st.roles) st.roles = {};
    return st;
  }
  // 자막 하나의 최종 값
  function capValues(c, d) {
    const st = normalizeStyle(d);
    const legacy = {};
    if (c.size != null) legacy.size = c.size;
    if (c.color) legacy.color = c.color;
    if (c.y != null) legacy.y = c.y;
    if (c.motion) legacy.motion = c.motion;
    else if (c.enter === "pop") legacy.motion = "pop";
    const v = Object.assign({}, BASE.cap, st.cap, (c.role && !c.noEmphasis && st.roles[c.role]) || {}, legacy, c.look || {});
    if (!CAPTION_MOTIONS[v.motion]) v.motion = "none";
    if (CAPTION_MOTIONS[v.motion].hookOnly) v.motion = "pop";
    return v;
  }
  // 훅 제목 값: BASE.head → style.head → 예전 훅 칸(style.look·size·y, enter) → hook.look
  function headValues(h, d) {
    const st = normalizeStyle(d);
    const legacy = {};
    const hs = (h && h.style) || {};
    if (hs.look && STYLE_PRESETS[hs.look]) Object.assign(legacy, STYLE_PRESETS[hs.look].head);
    if (hs.size) legacy.size = hs.size;
    if (hs.y != null) legacy.y = hs.y;
    if (h && h.enter) legacy.motion = h.enter;
    const v = Object.assign({}, BASE.head, st.head, legacy, (h && h.look) || {});
    if (!CAPTION_MOTIONS[v.motion] || v.motion === "none") v.motion = v.motion === "none" ? "none" : "pop";
    return v;
  }
  function ovValues(o, d) {
    const st = normalizeStyle(d);
    if (o.kind === "bubble") return Object.assign({}, BASE.bubble, st.bubble, o.look || {});
    if (o.kind === "chapter") return Object.assign({}, BASE.chapter, st.chapter, o.look || {});
    if (o.kind === "headline") return Object.assign({}, BASE.head, st.head, o.look || {});
    return null;
  }

  // 화면 전체 CSS: 글꼴 + 자막 · 훅 · 말풍선 · 챕터 · 위 큰 글자 하나하나 (값마다 다를 수 있음)
  function styleCSS(style, base) {
    return fontFaces(base);
  }
  function pageCSS(data, base, scope) {
    const d = defaults(data);
    const S = scope || "";
    let css = fontFaces(base);
    for (const c of d.captions) css += valuesCSS(`${S} #${CSS_ID(c.id)}`.trim(), capValues(c, d), ".sf-cl");
    const h = pickedHook(d);
    if (h) {
      const hv = headValues(h, d);
      css += valuesCSS(`${S} #sf-hook`.trim(), hv, ".sf-head");
      if (hv.motion === "chatStack") {
        // 말풍선: 줄마다 흰 말풍선, 왼쪽 정렬, 꼬리 (글자 모양 값보다 우선)
        const B = `${S} #sf-hook.sf-mo-chatStack .sf-head`.trim();
        css += `${B}{text-align:left;font-size:.5em;text-shadow:none;-webkit-text-stroke:0}${B} .sf-ln{background:#ffffff;color:#111111;border-radius:.7em .7em .7em .14em;padding:.32em .62em;margin:0 0 .3em;-webkit-text-stroke:0;text-shadow:none;box-shadow:0 .1em 0 rgba(0,0,0,.35);font-family:'Pretendard',sans-serif;font-weight:700;letter-spacing:-0.03em}` +
          `${B} .sf-ln:nth-of-type(2n){background:#fee500}${B} em{color:#d62828}`;
      }
    }
    for (const o of d.overlays) {
      const v = ovValues(o, d);
      if (!v) continue;
      const sel = `${S} #${CSS_ID(o.id)}`.trim();
      if (o.kind === "bubble") css += bubbleCSS(sel, v);
      else if (o.kind === "chapter") css += chapterCSS(sel, v);
      else css += valuesCSS(sel, v, ".sf-head");
    }
    return css;
  }

  // **강조** → <em>, 줄바꿈 → <br>
  function rich(t) {
    return esc(t).replace(/\*\*(.+?)\*\*/g, "<em>$1</em>").replace(/\n/g, "<br>");
  }

  // 모션용으로 낱말(.sf-w) · 글자(.sf-c)를 나눈 HTML. opts: { chars, karaoke, marker }
  function splitRich(text, opts) {
    const o = opts || {};
    const word = (w) => {
      let inner = o.chars ? [...w].map((c) => `<span class="sf-c">${esc(c)}</span>`).join("") : esc(w);
      // 숫자 굴리기: 숫자 묶음(쉼표 포함)을 .sf-num 으로
      if (o.num && !o.chars) inner = esc(w).replace(/\d[\d,]*/g, (n) => `<span class="sf-num" data-n="${n}">${n}</span>`);
      return `<span class="sf-w">${inner}${o.karaoke ? `<span class="sf-kf" aria-hidden="true">${esc(w)}</span>` : ""}</span>`;
    };
    const words = (s) => s.split(/( +)/).map((p) => (/^ +$/.test(p) ? " " : p ? word(p) : "")).join("");
    let hasEm = false;
    // 강조 장식 (동그라미 SVG · 모서리 꺾쇠)
    const deco = o.emDeco === "circle"
      ? `<svg class="sf-circ" viewBox="0 0 100 40" preserveAspectRatio="none"><path pathLength="100" d="M8 21 C6 9 36 3 60 4 C86 5 97 12 95 22 C93 33 64 38 42 37 C19 36 3 30 7 19 C9 13 17 8 28 6"/></svg>`
      : o.emDeco === "brackets" ? `<i class="sf-brk b1"></i><i class="sf-brk b2"></i><i class="sf-brk b3"></i><i class="sf-brk b4"></i>` : "";
    const emBody = (txt) => {
      // 같은 자리 바꿔 끼우기: **허리/목/어깨** → 한 칸에 겹쳐 두고 차례로 바뀜
      if (o.swap && txt.includes("/")) return `<span class="sf-swapbox">${txt.split("/").map((a) => `<span class="sf-w sf-swi">${esc(a.trim())}</span>`).join("")}</span>`;
      return words(txt);
    };
    // 줄마다 .sf-ln (상자가 줄마다 글자 폭만큼만)
    const html = String(text ?? "")
      .split("\n")
      .map((line, li, arr) =>
        `<span class="sf-ln${o.tiers && arr.length > 1 ? (/\*\*/.test(line) ? " sf-t2" : " sf-t1") : ""}">` + line.split(/(\*\*.+?\*\*)/).map((seg) => {
          const m = /^\*\*(.+)\*\*$/.exec(seg);
          if (!m) return words(seg);
          hasEm = true;
          return `<em>${o.marker ? '<i class="sf-mk"></i>' : ""}${deco}${emBody(m[1])}</em>`;
        }).join("") + `</span>`
      )
      .join("<br>");
    return (o.marker && !hasEm ? '<i class="sf-mk"></i>' : "") + html;
  }

  // 훅: hooks 중 hookPick (없으면 첫 번째)
  function pickedHook(d) {
    const hs = (d && Array.isArray(d.hooks)) ? d.hooks : [];
    if (!hs.length) return null;
    return hs.find((h) => h.id === d.hookPick) || hs[0];
  }
  // 글자 폭 어림 (한글 1, 영문·숫자 0.6, 띄어쓰기 0.35 글자)
  const textUnits = (line) => [...line].reduce((n, c) => n + (c === " " ? 0.35 : /[\x00-\x7f]/.test(c) ? 0.6 : 1), 0);
  // 강조어가 커지는 배수(강조 방식 「크게」 1.3 × 모션 「강조어만 툭」 최대 1.3)까지 쳐서 폭을 잰다
  const emGrow = (v) => (v && v.emMode === "big" ? 1.3 : 1) * (v && v.motion === "emphasis" ? 1.3 : 1);
  function richUnits(line, k, swap) {
    return line.split(/(\*\*.+?\*\*)/).reduce((u, seg) => {
      const m = /^\*\*(.+)\*\*$/.exec(seg);
      if (m && swap && m[1].includes("/")) return u + Math.max(...m[1].split("/").map((a) => textUnits(a.trim()))) * k;
      return u + (m ? textUnits(m[1]) * k : textUnits(seg));
    }, 0);
  }
  // 훅 글자 크기: 가장 긴 줄이 한 줄 최대 폭에 들어가게
  function hookSize(h, v) {
    const vv = v || Object.assign({}, BASE.head, h && h.style);
    const lines = (vv.fx === "twoTier" ? twoTierText(h && h.text) : String((h && h.text) || "")).split("\n");
    const len = Math.max(1, ...lines.map((l) => richUnits(l, emGrow(vv), vv.motion === "swap") * (vv.fx === "twoTier" && !/\*\*/.test(l) ? 0.56 : 1)));
    return Math.round(Math.min(vv.size, vv.maxWidth / len));
  }
  // 2단 크기 대비: **강조**가 있으면 강조 앞 = 윗줄(작게), 강조부터 = 아랫줄(크게). 없으면 뜻 단위로 반으로
  function twoTierText(t0) {
    const t = String(t0 || "").replace(/\n/g, " ");
    const m = /^(.*?)\s*(\*\*.+?\*\*.*)$/.exec(t);
    if (m && m[1].trim()) return m[1].trim() + "\n" + m[2].trim();
    if (m) {
      // 강조가 맨 앞: 강조 뒤 첫 띄어쓰기에서 나눔 (윗줄이 큰 키워드)
      const end = m[2].indexOf("**", 2) + 2;
      const sp = m[2].indexOf(" ", end);
      return sp > 0 ? m[2].slice(0, sp) + "\n" + m[2].slice(sp + 1) : t;
    }
    const sp = [...t.matchAll(/ /g)].map((x) => x.index);
    if (!sp.length) return t;
    const mid = sp.reduce((b, i) => (Math.abs(i - t.length / 2) < Math.abs(b - t.length / 2) ? i : b), sp[0]);
    return t.slice(0, mid) + "\n**" + t.slice(mid + 1) + "**";
  }
  // 긴 자막(한 줄 최대 폭 넘음, 줄바꿈 없음)은 가운데 가까운 띄어쓰기에서 두 줄로 (**강조** 안은 자르지 않음). caption.wrap:false 면 그대로
  function capText(c, v) {
    const vv = v || BASE.cap;
    const raw = c.noEmphasis ? String(c.text || "").replace(/\*\*/g, "") : c.text;
    if (vv.fx === "twoTier") return twoTierText(raw);
    const t = String(raw || "");
    const room = (vv.maxWidth - (vv.boxOn ? vv.pad * 2 : 0)) / vv.size;
    if (c.wrap === false || t.includes("\n") || richUnits(t, emGrow(vv), vv.motion === "swap") <= room) return t;
    const half = textUnits(t.replace(/\*\*/g, "")) / 2;
    let inEm = false, units = 0, best = -1, bestD = 1e9;
    for (let i = 0; i < t.length; i++) {
      if (t.startsWith("**", i)) { inEm = !inEm; i++; continue; }
      if (t[i] === " " && !inEm && Math.abs(units - half) < bestD) { best = i; bestD = Math.abs(units - half); }
      units += textUnits(t[i]);
    }
    return best > 0 ? t.slice(0, best) + "\n" + t.slice(best + 1) : t;
  }
  // 자막 글자 크기: 가장 긴 줄이 한 줄 최대 폭을 넘지 않게 자동으로 줄임 (caption.fit:false 면 그대로)
  function capSize(c, v) {
    const vv = v || BASE.cap;
    if (c.fit === false) return r2(vv.size);
    const len = Math.max(1, ...capText(c, vv).split("\n").map((l) => richUnits(l, emGrow(vv), vv.motion === "swap") * (vv.fx === "twoTier" && !/\*\*/.test(l) ? 0.56 : 1)));
    const pads = vv.boxOn ? (vv.pad * 2) : 0;
    return r2(Math.min(vv.size, (vv.maxWidth - pads) / len));
  }
  function capMotion(c, d) {
    return capValues(c, d).motion;
  }

  function defaults(data) {
    const d = Object.assign(
      { width: 1080, height: 1920, duration: 4, source: "", captions: [], overlays: [], camera: [], effects: [], feedback: [], style: {}, sfx: [], hooks: [], hookPick: null, layout: "full", panels: [] },
      data || {}
    );
    if (!d.style) d.style = {};
    if (!Array.isArray(d.hooks)) d.hooks = [];
    if (!LAYOUTS[d.layout]) d.layout = "full";
    if (!Array.isArray(d.panels)) d.panels = [];
    if (d.hooks.length && !d.hooks.find((h) => h.id === d.hookPick)) d.hookPick = d.hooks[0].id;
    normalizeStyle(d);
    return d;
  }

  // ── 정적 HTML (빌드: index.html 본문 / 편집기: 무대 innerHTML) ──
  function overlayInner(o, base) {
    if (o.kind === "chat") return chatHTML(o, { w: o.w || 900, h: o.h || 1180 });
    const s = o.size || 200;
    const B = base || "";
    if (o.kind === "sticker") {
      // 이미지 스티커: 등장(.sf-stk) · 기울기(.sf-stk-r, CSS 고정) · 계속 움직임(.sf-stk-i) 층을 나눔
      return `<div class="sf-stk"><div class="sf-stk-r" style="transform:rotate(${Number(o.rot) || 0}deg)">` +
        (o.src ? `<img class="sf-stk-i" src="${esc(B + o.src)}" style="width:${s}px">` : `<div class="sf-stk-i" style="width:${s}px;height:${s}px;font-size:${r2(s * 0.8)}px;line-height:1;text-align:center">${esc(o.emoji || "⭐")}</div>`) +
        `</div></div>`;
    }
    if (o.kind === "folder-burst") {
      const paper = (i) =>
        `<div class="sf-paper" data-paper="${i}" style="left:${r2(s * 0.6)}px;top:${r2(s * 0.32)}px;width:${r2(s * 0.4)}px;height:${r2(s * 0.5)}px"><i></i><i style="width:${[60, 70, 80][i]}%"></i><i></i></div>`;
      return (
        `<div class="sf-tile" style="width:${s}px;height:${s}px;border-radius:${r2(s * 0.23)}px">` +
        `<svg width="${r2(s * 0.66)}" height="${r2(s * 0.55)}" viewBox="0 0 132 110"><path d="M6 18 a10 10 0 0 1 10-10 h34 l12 12 h54 a10 10 0 0 1 10 10 v8 H6z" fill="#d99a2b"/><rect class="sf-sheet" x="16" y="22" width="100" height="40" rx="5" fill="#fff"/><rect x="6" y="34" width="120" height="70" rx="10" fill="#f2b84b"/></svg></div>` +
        paper(0) + paper(1) + paper(2)
      );
    }
    if (o.kind === "terminal") {
      return (
        `<div class="sf-tile" style="width:${s}px;height:${s}px;border-radius:${r2(s * 0.23)}px;background:#16181d">` +
        `<svg width="${r2(s * 0.6)}" height="${r2(s * 0.45)}" viewBox="0 0 120 90"><path d="M16 22 l26 22 -26 22" fill="none" stroke="#3ddc84" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><rect x="54" y="62" width="44" height="10" rx="5" fill="#e8eaed"/></svg></div>`
      );
    }
    if (o.kind === "emoji") {
      return `<div class="sf-tile" style="width:${s}px;height:${s}px;border-radius:${r2(s * 0.23)}px;background:${esc(o.bg || "#fff")}"><span style="font-size:${r2(s * 0.56)}px;line-height:1">${esc(o.emoji || "📄")}</span></div>`;
    }
    if (o.kind === "title") {
      return `<div class="sf-title" style="font-size:${o.fontSize || 64}px;background:${esc(o.bg || "#111")};color:${esc(o.color || "#fff")}">${esc(o.text || "위 글자")}</div>`;
    }
    if (o.kind === "headline") {
      return `<div class="sf-head" style="font-size:${o.fontSize || 110}px">${rich(o.text || "위 큰 글자")}</div>`;
    }
    if (o.kind === "chapter") {
      return `<div class="sf-chapter" style="font-size:${o.fontSize || 48}px">${rich(o.text || "1. 챕터")}</div>`;
    }
    if (o.kind === "app") {
      const inner = o.src
        ? `<img src="${esc(o.src)}" style="width:${r2(s * 0.62)}px;height:${r2(s * 0.62)}px;object-fit:contain">`
        : `<span style="font-size:${r2(s * (o.emoji ? 0.5 : 0.2))}px;font-weight:900;letter-spacing:-0.03em;color:#111">${esc(o.emoji || o.text || "App")}</span>`;
      return `<div class="sf-tile sf-app" style="width:${s}px;height:${s}px;border-radius:${r2(s * 0.24)}px">${inner}</div>`;
    }
    if (o.kind === "bubble") {
      const w = o.size || 360, h = r2(w * 0.5);
      return `<div class="sf-bubble" style="position:relative;width:${w}px;height:${h}px">` +
        `<svg width="${w}" height="${h}" viewBox="0 0 200 100" preserveAspectRatio="none" style="position:absolute;inset:0"><path d="M20 18 L60 22 L70 4 L88 20 L130 10 L140 22 L188 16 L176 44 L196 60 L170 70 L178 94 L130 82 L108 98 L92 82 L40 92 L44 74 L6 66 L26 50 L4 32 Z"/></svg>` +
        `<b style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${o.fontSize || 52}px;letter-spacing:-0.03em;white-space:nowrap">${esc(o.text || "말풍선")}</b></div>`;
    }
    if (o.kind === "quiz") {
      const opts = String(o.options || "1번 보기|2번 보기|3번 보기|기타 (직접 입력)").split("|");
      const keys = opts.map((t, i) => `<div class="sf-key${i === opts.length - 1 ? " etc" : ""}" data-key="${i}"><b>${i + 1}</b>${esc(t)}</div>`).join("");
      const dots = Array.from({ length: o.total || 5 }, (_, i) => `<i${i < (o.qnum || 1) ? ' class="on"' : ""}></i>`).join("");
      return `<div class="sf-quiz"><div class="sf-quiz-bar"><span style="background:#ff5f57"></span><span style="background:#febc2e"></span><span style="background:#28c840"></span><em>${esc(o.url || "Aside · 새 대화")}</em></div>` +
        `<div class="sf-quiz-body"><div class="sf-quiz-q"><span class="n">${o.qnum || 1}</span><span class="t">${esc(o.text || "질문")}</span><span class="d">${dots}</span></div><div class="sf-quiz-grid">${keys}</div></div></div>`;
    }
    if (o.kind === "dm") {
      // 끝 행동 카드: 팔로우 · 좋아요 눌림 → 댓글 입력 → DM으로 실제 프롬프트 도착
      const lines = String(o.prompt || "").split("\n");
      return `<div class="ax-wrap dm-wrap"><div class="ax-bg"></div><div class="dm-card">` +
        `<div class="dm-row1"><span class="dm-av"></span><span class="dm-name">${esc(o.handle || "이 영상")}</span>` +
          `<span class="dm-btn dm-follow"><em class="off">팔로우</em><em class="on">✓ 팔로잉</em></span>` +
          `<span class="dm-btn dm-like"><em class="off">♡ 좋아요</em><em class="on">♥ 좋아요</em></span></div>` +
        `<div class="dm-cmt"><span class="dm-ph">댓글 달기…</span><span class="dm-typed">${[...String(o.comment || "프롬프트 주세요")].map((ch) => `<i>${ch === " " ? "&nbsp;" : esc(ch)}</i>`).join("")}</span><span class="dm-post">게시</span></div>` +
        `<div class="dm-box"><div class="dm-head">📩 DM 도착 <span>방금</span></div>` +
          `<div class="dm-msg">요청하신 프롬프트예요 👇</div>` +
          `<div class="dm-prompt" data-layout-allow-overflow data-layout-allow-overlap><div class="dm-scroll">${lines.map((l) => `<div class="dm-ln">${esc(l) || "&nbsp;"}</div>`).join("")}</div></div></div>` +
        `</div></div>`;
    }
    if (o.kind === "wflist") {
      // 어사이드 창: 추천 워크플로 6개 (위 3개 = 10분 안에, 아래 3개 = 더 걸려도)
      const items = Array.isArray(o.items) ? o.items : [];
      const card = (it, i) =>
        `<div class="wf-card${i < 3 ? " quick" : ""}" data-i="${i}"><span class="wf-emo">${esc(it.emoji || "✨")}</span>` +
        `<span class="wf-t">${esc(it.title || "")}</span><span class="wf-s">${esc(it.site || "")}</span>` +
        (i < 3 ? `<span class="wf-badge">10분</span>` : "") + `</div>`;
      return `<div class="ax-wrap"><div class="ax-bg"></div><div class="ax-win">` +
        `<div class="ax-top"><span class="d" style="background:#ff5f57"></span><span class="d" style="background:#febc2e"></span><span class="d" style="background:#28c840"></span>` +
        `<span class="ax-brand"><i></i>Aside</span><span class="ax-new">＋ 새 대화</span></div>` +
        `<div class="wf-body"><div class="ax-ai"><span class="ax-av">A</span><div class="ax-aimsg">${esc(o.text || "찾은 사례로 워크플로 6개를 추천해요")}</div></div>` +
        `<div class="wf-lab l1">⚡ ${esc(o.label1 || "지금 10분 안에 만들 수 있는 것")}</div><div class="wf-row">${items.slice(0, 3).map(card).join("")}</div>` +
        `<div class="wf-lab l2">⏳ ${esc(o.label2 || "10분 넘어도 해 볼 만한 것")}</div><div class="wf-row">${items.slice(3, 6).map((it, j) => card(it, j + 3)).join("")}</div>` +
        `</div></div></div>`;
    }
    if (o.kind === "card") {
      // 자료 카드: 흰 테두리 둥근 카드 안에 캡처, 아래 작은 출처, 선택: 빨간 동그라미(hx,hy,hw,hh = 이미지 안 비율 %)
      const w = o.w || 720;
      const ring = o.hw ? `<svg class="sf-ring" style="position:absolute;left:${o.hx}%;top:${o.hy}%;width:${o.hw}%;height:${o.hh}%;overflow:visible" viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="50" cy="50" rx="52" ry="58" fill="none" stroke="#ff2d2d" stroke-width="5" vector-effect="non-scaling-stroke" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg>` : "";
      const src = o.source ? `<div class="sf-card-src">${esc(o.source)}</div>` : "";
      return `<div class="sf-tile sf-card" style="width:${w}px"><div class="sf-card-img" style="position:relative"><img src="${esc((o.src && !/^(\/|https?:)/.test(o.src) ? B : "") + (o.src || ""))}" style="display:block;width:100%;height:auto;border-radius:14px">${ring}</div>${src}</div>`;
    }
    if (o.kind === "screen") {
      return `<div class="sf-scr-bg" style="background:${esc(o.bg || "linear-gradient(180deg,#eef0f4,#dfe3ea)")}"></div>`;
    }
    if (o.kind === "aside") {
      // 어사이드 사이드 창 시뮬레이션 (위 절반) — 프롬프트 붙여 넣기 → 보내기 → 객관식 질문 → 번호 고르기
      const lines = String(o.prompt || "").split("\n");
      const qs = Array.isArray(o.questions) ? o.questions : [];
      const promptHtml = lines.map((l) => `<div class="ax-ln">${esc(l) || "&nbsp;"}</div>`).join("");
      const qcards = qs.map((q, qi) =>
        `<div class="ax-q" data-q="${qi}"><div class="ax-qh"><span class="ax-qn">Q${qi + 1}</span><span class="ax-qt">${esc(q.q)}</span>` +
        `<span class="ax-dots">${qs.map((_, j) => `<i${j <= qi ? ' class="on"' : ""}></i>`).join("")}</span></div>` +
        `<div class="ax-opts">${(q.options || []).map((t, i) => `<div class="ax-opt${i === (q.options.length - 1) ? " etc" : ""}" data-opt="${i}"><b>${i + 1}</b>${esc(t)}</div>`).join("")}</div></div>`
      ).join("");
      return `<div class="ax-wrap">` +
        `<div class="ax-bg"></div>` +
        `<div class="ax-win">` +
          `<div class="ax-top"><span class="d" style="background:#ff5f57"></span><span class="d" style="background:#febc2e"></span><span class="d" style="background:#28c840"></span>` +
          `<span class="ax-brand"><i></i>Aside</span><span class="ax-new">＋ 새 대화</span></div>` +
          `<div class="ax-chat">` +
            `<div class="ax-empty">무엇을 도와드릴까요?</div>` +
            `<div class="ax-user" data-layout-allow-overflow data-layout-allow-overlap><div class="ax-ubub">${promptHtml}</div></div>` +
            `<div class="ax-ai"><span class="ax-av">A</span><div class="ax-typing"><i></i><i></i><i></i></div>` +
              `<div class="ax-aimsg">좋아요! 객관식으로 하나씩 물어볼게요. 번호만 골라 주세요.</div></div>` +
            `<div class="ax-qs">${qcards}</div>` +
          `</div>` +
          `<div class="ax-input"><div class="ax-ph">Aside에게 물어보기…</div><div class="ax-typed" data-layout-allow-overflow data-layout-allow-overlap>${promptHtml}</div>` +
            `<div class="ax-ibar"><span class="ax-plus">＋</span><span class="ax-send">↑</span></div></div>` +
        `</div>` +
        `<svg class="ax-cursor" width="56" height="56" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.6 L12 13.8 L19 13.8 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>` +
        `</div>`;
    }
    return "";
  }

  function overlayBox(o) {
    // 위 글자는 가운데 기준 자동 너비, 나머지는 정사각
    if (isCentered(o.kind)) return `left:${o.x}px;top:${o.y}px;transform:translate(-50%,-50%)`;
    if (o.kind === "insert") {
      if (!VIS_LAYOUTS[o.layout] || o.layout === "full" || o.layout === "pip") return `left:0;top:0;width:1080px;height:1920px`;
      const b = visSlot(o.layout, o.pipPos).box;
      return `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px${o.layout === "float" ? ";border-radius:40px" : ""}`;
    }
    if (o.kind === "chat") { const w = o.w || 900; return `left:${r2((o.x ?? 540) - w / 2)}px;top:${o.y ?? 300}px;width:${w}px`; }
    if (o.kind === "aside" || o.kind === "wflist" || o.kind === "dm") return `left:0;top:0;width:1080px;height:${o.h || 960}px;overflow:hidden`;
    if (o.kind === "screen") return `left:0;top:0;width:1080px;height:1920px`;
    if (o.kind === "card") { const w = o.w || 720; return `left:${r2(o.x - w / 2)}px;top:${o.y}px;width:${w}px`; }
    const s = o.size || 200;
    return `left:${r2(o.x - s / 2)}px;top:${r2(o.y - s / 2)}px;width:${s}px;height:${s}px`;
  }

  // ══ 시각 자료 (그림판 · 대화 화면 · 장면 컷) — 자료마다 레이아웃 ══
  const VIS_LAYOUTS = {
    full: { label: "전체 화면 카드", desc: "영상을 가리고 자료만 (1.5~3초)" },
    splitTop: { label: "반반 · 위 자료", desc: "위 절반 자료 · 아래 얼굴" },
    splitBottom: { label: "반반 · 아래 자료", desc: "위 얼굴 · 아래 절반 자료" },
    pip: { label: "화면 속 화면", desc: "큰 자료 + 얼굴 동그라미" },
    float: { label: "떠 있는 카드", desc: "얼굴 위에 카드 · 뒤 영상 어둡게" },
  };
  const PIP_POS = { tr: "오른쪽 위", tl: "왼쪽 위", br: "오른쪽 아래", bl: "왼쪽 아래" };
  // 자리: box = 자료 영역(화면 좌표), c = 내용 영역(box 안 좌표), capY = 이 자료가 있는 동안 자막 위치, face = 얼굴 처리
  // 인스타 가림(위 약 220 · 아래 약 380)을 피해 내용을 둔다
  function visSlot(layout, pos) {
    const P = pos || "tr";
    switch (layout) {
      case "full": return { box: { x: 0, y: 0, w: 1080, h: 1920 }, c: { x: 70, y: 250, w: 940, h: 1030 }, capY: 1330 };
      case "splitBottom": return { box: { x: 0, y: 960, w: 1080, h: 960 }, c: { x: 70, y: 175, w: 940, h: 400 }, capY: 978 };
      case "pip": {
        const top = P === "tr" || P === "tl";
        const cx = P === "tr" || P === "br" ? 845 : 235, cy = top ? 430 : 1200;
        return { box: { x: 0, y: 0, w: 1080, h: 1920 }, c: top ? { x: 70, y: 650, w: 940, h: 640 } : { x: 70, y: 250, w: 940, h: 740 }, capY: top ? 1330 : 1420, pip: { cx, cy, r: 175 } };
      }
      case "float": return { box: { x: 50, y: 330, w: 980, h: 900 }, c: { x: 50, y: 56, w: 880, h: 840 }, capY: 1330 };
      default: return { box: { x: 0, y: 0, w: 1080, h: 900 }, c: { x: 70, y: 210, w: 940, h: 640 }, capY: 925 };
    }
  }
  // 그림판 패널의 레이아웃 (예전 edit.json: 전체 틀이 card 면 full, 아니면 위 자료)
  const visLayoutOf = (o, d) => (VIS_LAYOUTS[o.layout] ? o.layout : d && d.layout === "card" ? "full" : "splitTop");
  // 이 자막 시각에 화면을 차지한 시각 자료 (자막 자리 자동 조정용)
  function visualsOf(d) {
    const out = [];
    for (const pn of d.panels || []) out.push({ o: pn, layout: visLayoutOf(pn, d) });
    for (const o of d.overlays || []) if ((o.kind === "chat" || o.kind === "insert") && VIS_LAYOUTS[o.layout] && !(o.kind === "insert" && o.layout === "full")) out.push({ o, layout: o.layout });
    return out;
  }
  function capYFor(c, d, y0) {
    const mid = (c.start + c.end) / 2;
    const v = visualsOf(d).find((x) => mid >= x.o.start && mid < x.o.end);
    return v ? visSlot(v.layout, v.o.pipPos).capY : y0;
  }

  // ── 아이콘 (직접 그린 SVG, 선 굵기 통일) ──
  const ICON = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 L21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.3" fill="currentColor"/><circle cx="15" cy="10" r="1.3" fill="currentColor"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M4 12 L20 4 L14 20 L11.5 13 Z" fill="currentColor"/></svg>',
    person: '<svg viewBox="0 0 40 40"><circle cx="20" cy="15" r="7.5" fill="#ffffff"/><path d="M6 36c1.5-8 7.5-12 14-12s12.5 4 14 12z" fill="#ffffff"/></svg>',
    signal: '<svg viewBox="0 0 28 20"><rect x="1" y="13" width="4.5" height="6" rx="1" fill="currentColor"/><rect x="8" y="9" width="4.5" height="10" rx="1" fill="currentColor"/><rect x="15" y="5" width="4.5" height="14" rx="1" fill="currentColor"/><rect x="22" y="1" width="4.5" height="18" rx="1" fill="currentColor"/></svg>',
    wifi: '<svg viewBox="0 0 26 20"><path d="M13 18.5 L9.6 14.6a5 5 0 0 1 6.8 0z" fill="currentColor"/><path d="M5.5 10.8a10.6 10.6 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M1.8 6.9a16 16 0 0 1 22.4 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    battery: '<svg viewBox="0 0 40 20"><rect x="1" y="2" width="33" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="5" width="24" height="10" rx="2" fill="currentColor"/><rect x="36" y="7" width="3" height="6" rx="1.2" fill="currentColor"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    quote: '<svg viewBox="0 0 48 36"><path d="M2 34V20C2 9 8 3 18 1l2 5c-6 2-9 6-9 11h8v17zm26 0V20C28 9 34 3 44 1l2 5c-6 2-9 6-9 11h8v17z" fill="currentColor"/></svg>',
    train: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="14" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 10h14" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor"/><path d="M8 17l-2 4M16 17l2 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    car: '<svg viewBox="0 0 24 24"><path d="M4 15v-3l2-5h12l2 5v3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8" cy="16.5" r="2" fill="currentColor"/><circle cx="16" cy="16.5" r="2" fill="currentColor"/></svg>',
    bus: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 11h16M8 18v3M16 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    walk: '<svg viewBox="0 0 24 24"><circle cx="13" cy="4.5" r="2" fill="currentColor"/><path d="M11 9l-2 5 3 2 1 5M11 9l3 2 3 1M9 14l-3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plane: '<svg viewBox="0 0 24 24"><path d="M2 13l8-2 4-8 2 1-2 7 6 1 1 2-7 1-3 6-2-1 1-5-7-1z" fill="currentColor"/></svg>',
  };
  const ROUTE_MODES = { train: "기차", car: "자동차", bus: "버스", walk: "걸어서", plane: "비행기" };

  // ── 그림판 템플릿 ──
  const TEMPLATES = { none: "없음 (제목 · 글만)", bigNumber: "큰 숫자 카드", compare: "사실 비교 카드", checklist: "체크리스트", calendar: "달력", route: "경로 · 지도", quote: "인용 카드", timeline: "타임라인", chat: "대화 화면" };
  const TPL_SAMPLE = {
    bigNumber: { number: "8", unit: "개월", desc: "두드러기와 함께한 시간" },
    compare: { leftLabel: "처음", leftValue: "3일에 한 번", rightLabel: "지금", rightValue: "2일에 한 번" },
    checklist: { items: "약 먹은 날짜 적기\n자극적인 음식 줄이기\n잠 7시간 지키기" },
    calendar: { year: "2026", month: "11", marks: "3,6,8,10" },
    route: { from: "인천", to: "부산", mode: "train" },
    quote: { text: "이제는 밤에 깨지 않고 자요", source: "환자분" },
    timeline: { items: "두드러기,8,8개월\n한의원 치료,3,석 달" },
    chat: { theme: "yellow", frame: true },
  };
  const tdOf = (pn) => Object.assign({}, TPL_SAMPLE[pn.tpl] || {}, pn.tplData || {});
  function tplHTML(pn, c, tok) {
    const t = pn.tpl, td = tdOf(pn), W = c.w;
    const card = (inner, cls) => `<div class="sf-tcard ${cls || ""}">${inner}</div>`;
    if (t === "bigNumber") {
      return `<div class="sf-t sf-tnum">` + card(`<div class="sf-tn"><span class="sf-tnv" data-v="${esc(td.number)}">${esc(td.number)}</span><span class="sf-tnu">${esc(td.unit || "")}</span></div><i class="sf-tbar"></i>` + (td.desc ? `<div class="sf-tdesc">${esc(td.desc)}</div>` : "")) + `</div>`;
    }
    if (t === "compare") {
      return `<div class="sf-t sf-tcmp">` + card(`<div class="sf-tlab">${esc(td.leftLabel || "")}</div><div class="sf-tval">${esc(td.leftValue || "")}</div>`, "sf-tc1") +
        `<div class="sf-tarrow">${ICON.arrow}</div>` + card(`<div class="sf-tlab">${esc(td.rightLabel || "")}</div><div class="sf-tval">${esc(td.rightValue || "")}</div>`, "sf-tc2") + `</div>`;
    }
    if (t === "checklist") {
      const items = String(td.items || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5);
      const rowH = Math.max(66, Math.min(112, Math.floor((c.h - 60) / Math.max(1, items.length))));
      return `<div class="sf-t sf-tchk${rowH < 86 ? " compact" : ""}">` + card(items.map((x, i) => `<div class="sf-tck" data-i="${i}" style="height:${rowH}px"><svg class="sf-tbox" viewBox="0 0 64 64"><rect class="sf-tboxr" x="3" y="3" width="58" height="58" rx="16"/><path class="sf-tchkp" pathLength="100" d="M16 33 L28 45 L49 21"/></svg><span>${esc(x)}</span></div>`).join("")) + `</div>`;
    }
    if (t === "calendar") {
      const y = parseInt(td.year, 10) || 2026, m = Math.min(12, Math.max(1, parseInt(td.month, 10) || 1));
      const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const rows = Math.ceil((first + days) / 7);
      const marks = String(td.marks || "").split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= days);
      const cellH = Math.max(62, Math.min(96, Math.floor((c.h - 300) / rows)));
      const wk = ["일", "월", "화", "수", "목", "금", "토"].map((w, i) => `<span class="${i === 0 ? "sun" : ""}">${w}</span>`).join("");
      let cells = "";
      for (let i = 0; i < rows * 7; i++) {
        const dd = i - first + 1;
        const mi = marks.indexOf(dd);
        cells += `<span class="sf-tday${dd < 1 || dd > days ? " out" : ""}${mi >= 0 ? " mk" : ""}${i % 7 === 0 ? " sun" : ""}" style="height:${cellH}px">` +
          (dd >= 1 && dd <= days ? `${mi >= 0 ? `<svg class="sf-tring" viewBox="0 0 100 100"><circle pathLength="100" cx="50" cy="50" r="42" data-i="${mi}"/></svg>` : ""}<b>${dd}</b>` : "") + `</span>`;
      }
      const gaps = marks.slice(1).map((x, i) => x - marks[i]);
      return `<div class="sf-t sf-tcal">` + card(`<div class="sf-tcalh"><b>${m}월</b><span>${y}</span></div><div class="sf-twk">${wk}</div><div class="sf-tgrid">${cells}</div>`) +
        (gaps.length ? `<div class="sf-tgaps"><span class="sf-tgl">간격</span>${gaps.map((g, i) => `<span class="sf-tgap" data-i="${i}">${g}일</span>`).join("")}</div>` : "") + `</div>`;
    }
    if (t === "route") {
      const w = W - 120, h = 300;
      const p0 = [70, 230], p2 = [w - 70, 230], p1 = [w / 2, 30];
      const path = `M${p0[0]} ${p0[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
      return `<div class="sf-t sf-troute">` + card(`<svg class="sf-tmap" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path class="sf-tpath0" d="${path}"/><path class="sf-tpath" pathLength="100" d="${path}"/>` +
        `<circle class="sf-tdot0" cx="${p0[0]}" cy="${p0[1]}" r="22"/><circle class="sf-tdot1" cx="${p2[0]}" cy="${p2[1]}" r="22"/></svg>` +
        `<span class="sf-tveh" data-p="${p0.join(",")},${p1.join(",")},${p2.join(",")}" style="left:${p0[0] + 60}px;top:${p0[1] + 46}px">${ICON[td.mode] || ICON.train}</span>` +
        `<div class="sf-tends"><div><span>출발</span><b>${esc(td.from || "")}</b></div><div><span>도착</span><b>${esc(td.to || "")}</b></div></div>`) + `</div>`;
    }
    if (t === "quote") {
      return `<div class="sf-t sf-tquote">` + card(`<span class="sf-tqm">${ICON.quote}</span><div class="sf-tqt">${esc(td.text || "")}</div><div class="sf-tqs">— ${esc(td.source || "환자분")}</div>`) + `</div>`;
    }
    if (t === "timeline") {
      const rows = String(td.items || "").split("\n").map((l) => l.split(",").map((x) => x.trim())).filter((a) => a[0]).slice(0, 4);
      const max = Math.max(1, ...rows.map((r) => parseFloat(r[1]) || 0));
      return `<div class="sf-t sf-ttl">` + card(rows.map((r, i) => `<div class="sf-trow"><div class="sf-trh"><b>${esc(r[0])}</b><span>${esc(r[2] || r[1] || "")}</span></div><div class="sf-ttrack"><i class="sf-tfill" data-i="${i}" style="width:${r2(Math.max(0.06, (parseFloat(r[1]) || 0) / max) * 100)}%"></i></div></div>`).join("")) + `</div>`;
    }
    if (t === "chat") return chatHTML(Object.assign({}, td, pn, { messages: pn.messages, title: pn.chatTitle || pn.title || "환자분" }), { w: c.w, h: c.h });
    return "";
  }

  // ── 메신저 v2: 실제 앱 화면 구조 (앱 로고 · 이름 없음) ──
  const CHAT_THEMES = {
    yellow: { label: "노랑 말풍선", bg: "#b2c7da", me: "#fee500", meText: "#191919", them: "#ffffff", themText: "#191919", head: "#b2c7da", headText: "#191919", unread: "#f2b705", chip: "rgba(0,0,0,.18)", chipText: "#ffffff", avatar: true, tail: "top" },
    blue: { label: "파랑 말풍선", bg: "#ffffff", me: "#0a84ff", meText: "#ffffff", them: "#e9e9eb", themText: "#111111", head: "#f6f6f7", headText: "#111111", unread: "#0a84ff", chip: "rgba(0,0,0,0)", chipText: "#8a8a8e", avatar: false, tail: "bottom" },
    white: { label: "흰 말풍선", bg: "#eef0f3", me: "#ffffff", meText: "#111111", them: "#ffffff", themText: "#111111", head: "#ffffff", headText: "#111111", unread: "#e03131", chip: "rgba(0,0,0,.08)", chipText: "#5a6068", avatar: true, tail: "top", meBorder: "#cfd4da" },
  };
  const CHAT_ANIMS = { pop: "톡 튀어나옴", slide: "옆에서 쓱", rise: "아래에서 올라옴", typing: "입력 중 점 → 말풍선" };
  const CHAT_COLORS = { bg: "#b2c7da", them: "#ffffff", me: "#fee500", text: "#191919" };
  // o: messages · title · hideName · theme · frame · showTime · showRead · colors · date
  function chatHTML(o, size) {
    const th = Object.assign({}, CHAT_THEMES[o.theme] || CHAT_THEMES.yellow);
    const cc = o.colors || {};
    if (cc.bg) th.bg = cc.bg;
    if (cc.me) th.me = cc.me;
    if (cc.them) th.them = cc.them;
    const msgs = Array.isArray(o.messages) ? o.messages : [];
    let title = String(o.title || "환자분");
    if (o.hideName && title) title = title[0] + "OO";
    const hl = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<em class="sf-chl">$1</em>').replace(/\n/g, "<br>");
    const frame = o.frame !== false;
    const W = (size && size.w) || o.w || 900, H = (size && size.h) || o.h || 1180;
    const showTime = o.showTime !== false, showRead = o.showRead !== false;
    const body = msgs.map((m, i) => {
      const me = m.from === "me";
      const meta = `<span class="sf-cmeta">${me && showRead ? `<b class="sf-cun" style="color:${th.unread}">1</b>` : ""}${showTime && m.at ? `<i>${esc(m.at)}</i>` : ""}</span>`;
      const bub = `<div class="sf-cbub ${th.tail === "bottom" ? "tb" : "tt"}" style="background:${me ? th.me : th.them};color:${me ? th.meText : th.themText}${me && th.meBorder ? `;box-shadow:inset 0 0 0 2px ${th.meBorder}` : ""};--tail:${me ? th.me : th.them}">${hl(m.text)}</div>`;
      const typing = !me ? `<div class="sf-cm sf-ctyp" data-for="${i}"><div class="sf-crow">${th.avatar ? `<span class="sf-cav"></span>` : ""}<div class="sf-cbub ${th.tail === "bottom" ? "tb" : "tt"} sf-cdots" style="background:${th.them};--tail:${th.them}"><i></i><i></i><i></i></div></div></div>` : "";
      return typing + `<div class="sf-cm ${me ? "me" : "them"}" data-i="${i}"><div class="sf-crow">` +
        (me ? meta + bub : (th.avatar ? `<span class="sf-cav">${ICON.person}</span>` : "") + `<div class="sf-ccol">${th.avatar ? `<span class="sf-cname">${esc(title)}</span>` : ""}<div class="sf-cline">${bub}${meta}</div></div>`) + `</div></div>`;
    }).join("");
    const date = o.date || "2026년 11월 25일 화요일";
    return `<div class="sf-chat2${frame ? " framed" : ""}" style="width:${W}px;height:${H}px;--cbg:${th.bg};--chead:${th.head};--cht:${th.headText};--cchip:${th.chip};--cchipt:${th.chipText}">` +
      `<div class="sf-cscr">` +
      `<div class="sf-cstat"><b>9:41</b><span class="sf-cico">${ICON.signal}${ICON.wifi}${ICON.battery}</span></div>` +
      `<div class="sf-chead"><span class="sf-cbk">${ICON.back}</span><b>${esc(title)}</b><span class="sf-chic">${ICON.search}${ICON.menu}</span></div>` +
      `<div class="sf-cbody"><div class="sf-cdate"><span>${esc(date)}</span></div>${body}</div>` +
      `<div class="sf-cin"><span class="sf-cplus">${ICON.plus}</span><span class="sf-cfield">메시지 입력</span><span class="sf-cemo">${ICON.smile}</span><span class="sf-csend" style="background:${th.me};color:${th.meText}">${ICON.send}</span></div>` +
      `</div></div>`;
  }

  // 자료 하나를 그리는 상자 (패널 · 대화 · 장면 컷 공용)
  function visualHTML(pn, d, base, kind) {
    const L = visLayoutOf(pn, d);
    const sl = visSlot(L, pn.pipPos);
    const b = sl.box, c = sl.c;
    const tok = { acc: Object.assign({}, BASE.cap, d.style.cap).emColor || "#e9ed12" };
    const bg = pn.bg || (L === "float" ? "#ffffff" : "#f3f4f6");
    const ink = pn.color || "#111214";
    let inner = "";
    if (kind === "chat") inner = chatHTML(pn, { w: c.w, h: c.h });
    else {
      const hasTpl = pn.tpl && pn.tpl !== "none";
      inner = (pn.title && pn.tpl !== "chat" ? `<div class="sf-vt">${rich(pn.title)}</div>` : "") +
        (pn.image ? `<img class="sf-pimg" src="${esc(base + pn.image)}" alt="">` : "") +
        (pn.text ? `<div class="sf-vx">${rich(pn.text)}</div>` : "") +
        (hasTpl ? tplHTML(pn, { w: c.w, h: c.h - (pn.title && pn.tpl !== "chat" ? 110 : 0) - (pn.text ? 80 : 0) }, tok) : "") +
        (!hasTpl && Array.isArray(pn.messages) && pn.messages.length ? chatHTML(Object.assign({}, pn, { title: pn.chatTitle || "환자분" }), { w: c.w, h: c.h - 120 }) : "") +
        chartHTML(pn) + calloutHTML(pn, b.h);
    }
    return `<div id="${CSS_ID(pn.id)}" class="clip sf-panel sf-vis lay-${L}" data-start="${r2(pn.start)}" data-duration="${r2(pn.end - pn.start)}" data-track-index="3" ` +
      `style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;background:${kind === "chat" && L !== "float" ? "#eef0f3" : esc(bg)};color:${esc(ink)};--acc:${esc(tok.acc)};--acct:${isLight(tok.acc) ? "#111111" : "#ffffff"}">` +
      `<div class="sf-pin" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px">${inner}</div></div>` + transLayer(pn);
  }

  // 얼굴(촬영본 층) 처리: 반반이면 옮기고, 화면 속 화면이면 동그라미로 줄이고, 떠 있는 카드면 어둡게
  function faceFor(tl, q, o, L, s, e) {
    const lay = q("#sf-lay"), ring = q("#sf-ring"), dim = q("#sf-dim");
    if (!lay) return;
    const out = Math.max(s + 0.4, e - 0.3);
    const FY = 760; // 원본에서 얼굴이 있는 높이
    if (L === "splitTop" || L === "splitBottom") {
      const shift = o.shift ?? (L === "splitTop" ? 620 : -300);
      tl.set(lay, { y: 0 }, s);
      tl.to(lay, { y: shift, duration: 0.35, ease: "power3.inOut" }, s);
      tl.to(lay, { y: 0, duration: 0.3, ease: "power3.inOut" }, out);
    } else if (L === "pip") {
      const sl = visSlot("pip", o.pipPos).pip;
      const R0 = 520, k = sl.r / R0;
      const tx = r2(sl.cx - 540 * k), ty = r2(sl.cy - FY * k);
      tl.set(lay, { zIndex: 15, clipPath: `circle(2300px at 540px ${FY}px)`, x: 0, y: 0, scale: 1 }, s);
      tl.to(lay, { x: tx, y: ty, scale: k, clipPath: `circle(${R0}px at 540px ${FY}px)`, duration: 0.45, ease: "power3.inOut" }, s);
      tl.to(lay, { x: 0, y: 0, scale: 1, clipPath: `circle(2300px at 540px ${FY}px)`, duration: 0.35, ease: "power3.inOut" }, out);
      tl.set(lay, { zIndex: 0, clipPath: "none" }, out + 0.36);
      if (ring) {
        tl.set(ring, { left: sl.cx - sl.r - 8, top: sl.cy - sl.r - 8, width: sl.r * 2 + 16, height: sl.r * 2 + 16, opacity: 0 }, s);
        tl.to(ring, { opacity: 1, duration: 0.2 }, s + 0.4);
        tl.to(ring, { opacity: 0, duration: 0.12 }, out);
      }
    } else if (L === "float" && dim) {
      tl.set(dim, { opacity: 0 }, s);
      tl.to(dim, { opacity: 0.55, duration: 0.3 }, s);
      tl.to(dim, { opacity: 0, duration: 0.3 }, out);
    }
  }
  // 자료 상자 등장 · 퇴장 (레이아웃마다)
  function visEnter(tl, el, L, s, e, tin) {
    const out = Math.max(s + 0.4, e - 0.3);
    const H = L === "splitTop" ? 900 : 960;
    if (tin === "cut" || tin === "colorWipe" || tin === "lightLeak") { if (tin === "lightLeak") tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3 }, s); return; }
    if (L === "splitTop") { tl.fromTo(el, { y: -H }, { y: 0, duration: 0.38, ease: "power3.out" }, s); tl.to(el, { y: -H, duration: 0.3, ease: "power3.in" }, out); }
    else if (L === "splitBottom") { tl.fromTo(el, { y: H }, { y: 0, duration: 0.38, ease: "power3.out" }, s); tl.to(el, { y: H, duration: 0.3, ease: "power3.in" }, out); }
    else if (L === "float") { tl.fromTo(el, { scale: 0.92, opacity: 0, y: 40 }, { scale: 1, opacity: 1, y: 0, duration: 0.34, ease: "back.out(1.6)" }, s); tl.to(el, { scale: 0.95, opacity: 0, duration: 0.25, ease: "power2.in" }, out + 0.05); }
    else { tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, s); tl.to(el, { opacity: 0, duration: 0.25 }, out + 0.05); }
  }
  // 템플릿 · 대화 움직임 (자료가 열린 뒤 차례로)
  function tplAnim(tl, host, pn, s) {
    if (!host) return;
    const one = (sel) => host.querySelector(sel), all = (sel) => Array.from(host.querySelectorAll(sel));
    const kids = one(".sf-pin") ? Array.from(one(".sf-pin").children) : [];
    kids.forEach((k, i) => tl.fromTo(k, { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, s + 0.15 + i * 0.12));
    const t0 = s + 0.45;
    const nv = one(".sf-tnv");
    if (nv) {
      const raw = nv.dataset.v || nv.textContent, target = parseFloat(String(raw).replace(/,/g, "")) || 0, dec = (String(raw).split(".")[1] || "").length;
      const o2 = { v: 0 };
      tl.fromTo(o2, { v: 0 }, { v: target, duration: 0.9, ease: "power3.out", onUpdate: () => { nv.textContent = raw.includes(",") ? Math.round(o2.v).toLocaleString("en-US") : o2.v.toFixed(dec); }, onComplete: () => { nv.textContent = raw; } }, t0);
      const bar = one(".sf-tbar");
      if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out" }, t0 + 0.3);
    }
    if (one(".sf-tcmp")) {
      tl.fromTo(one(".sf-tc1"), { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, t0);
      tl.fromTo(one(".sf-tarrow"), { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.4)" }, t0 + 0.3);
      tl.fromTo(one(".sf-tc2"), { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, t0 + 0.5);
    }
    all(".sf-tck").forEach((r, i) => {
      const t = t0 + i * 0.35;
      tl.fromTo(r, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.25, ease: "power2.out" }, t);
      const rect = r.querySelector(".sf-tboxr"), p = r.querySelector(".sf-tchkp");
      if (rect) tl.fromTo(rect, { attr: { "fill-opacity": 0 } }, { attr: { "fill-opacity": 1 }, duration: 0.15 }, t + 0.2);
      if (p) tl.fromTo(p, { attr: { "stroke-dashoffset": 100 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.3, ease: "power2.out" }, t + 0.25);
    });
    all(".sf-tring circle").forEach((c) => { const i = +c.dataset.i; tl.fromTo(c, { attr: { "stroke-dashoffset": 100 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.35, ease: "power2.inOut" }, t0 + i * 0.35); });
    all(".sf-tgap").forEach((g, i) => tl.fromTo(g, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.2, ease: "back.out(2)" }, t0 + (i + 1) * 0.35 + 0.2));
    const path = one(".sf-tpath");
    if (path) {
      tl.fromTo(path, { attr: { "stroke-dashoffset": 100 } }, { attr: { "stroke-dashoffset": 0 }, duration: 1.0, ease: "power1.inOut" }, t0 + 0.2);
      const veh = one(".sf-tveh");
      if (veh) {
        // 탈것이 곡선을 따라감: 2차 곡선 위 점 12개를 정해 놓고 차례로 (무작위 없음)
        const p = veh.dataset.p.split(",").map(Number);
        const pts = Array.from({ length: 12 }, (_, i) => { const u = (i + 1) / 12, a = (1 - u) * (1 - u), b2 = 2 * (1 - u) * u, cc = u * u; return { x: a * p[0] + b2 * p[2] + cc * p[4], y: a * p[1] + b2 * p[3] + cc * p[5] }; });
        tl.set(veh, { x: 0, y: 0 }, s);
        tl.to(veh, { keyframes: pts.map((pt) => ({ x: r2(pt.x - p[0]), y: r2(pt.y - p[1]), duration: 1.0 / 12, ease: "none" })) }, t0 + 0.2);
      }
      all(".sf-tends > div").forEach((x, i) => tl.fromTo(x, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.25, ease: "back.out(2)" }, t0 + i * 1.0));
    }
    const qm = one(".sf-tqm");
    if (qm) tl.fromTo(qm, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.4)" }, t0);
    all(".sf-tfill").forEach((f, i) => tl.fromTo(f, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power3.out" }, t0 + i * 0.3));
    chatAnim(tl, host, pn, t0 - 0.1);
  }
  // 대화: 메시지가 차례로 올라오며 위로 밀림(아래 정렬 + 높이 자람) · 입력 중 점 · 읽음 1 사라짐
  function chatAnim(tl, root, o, s) {
    const box = root && root.querySelector(".sf-chat2");
    if (!box) return;
    const anim = o.bubbleAnim || "pop";
    const gap = Number(o.gap) || 0.9;
    const msgs = Array.from(box.querySelectorAll(".sf-cm:not(.sf-ctyp)"));
    msgs.forEach((m, i) => {
      const me = m.classList.contains("me");
      const md = (o.messages || [])[i] || {};
      let t = s + 0.3 + (md.t != null ? Number(md.t) : i * gap);
      const typ = box.querySelector('.sf-ctyp[data-for="' + i + '"]');
      if (typ) {
        tl.set(typ, { height: 0, opacity: 0 }, s);
        if (anim === "typing") {
          tl.to(typ, { height: "auto", opacity: 1, duration: 0.18, ease: "power2.out" }, t);
          Array.from(typ.querySelectorAll(".sf-cdots i")).forEach((dt, j) => tl.fromTo(dt, { y: 0 }, { y: -8, duration: 0.12, yoyo: true, repeat: 1, ease: "sine.inOut" }, t + 0.12 + j * 0.08));
          tl.to(typ, { height: 0, opacity: 0, duration: 0.12 }, t + 0.55);
          t += 0.6;
        }
      }
      const bub = m.querySelector(".sf-crow");
      tl.fromTo(m, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.26, ease: "power2.out" }, t);
      const from = anim === "slide" ? { x: me ? 30 : -30 } : anim === "rise" ? { y: 30 } : { scale: 0.7, transformOrigin: me ? "100% 100%" : "0% 0%" };
      const to = anim === "slide" ? { x: 0 } : anim === "rise" ? { y: 0 } : { scale: 1 };
      if (bub) tl.fromTo(bub, from, Object.assign({ duration: 0.28, ease: anim === "pop" || anim === "typing" ? "back.out(2)" : "power3.out" }, to), t);
      const un = m.querySelector(".sf-cun");
      if (un) tl.fromTo(un, { opacity: 1 }, { opacity: 0, duration: 0.2, immediateRender: false }, t + 1.1);
    });
  }

  // 전환 띠 (색면 와이프 · 빛 띠): 장면 컷 · 패널 옆에 두는 시간 없는 요소 (평소엔 화면 밖)
  function transLayer(o) {
    const ts = [o.enter, o.exit];
    const out = [];
    if (ts.includes("colorWipe")) out.push(`<div id="${CSS_ID(o.id)}_tw" class="sf-tw sf-tw-wipe" style="background:${esc(o.wipeColor || "#e9ed12")}"></div>`);
    if (ts.includes("lightLeak")) out.push(`<div id="${CSS_ID(o.id)}_tl" class="sf-tw sf-tw-leak"></div>`);
    return out.join("");
  }
  // 그림판: 선 그어 짚기 — callouts = "가로%,세로%,라벨" 줄마다
  function parseLines(t) {
    return String(t || "").split("\n").map((l) => l.split(",").map((x) => x.trim())).filter((a) => a.length >= 2 && a[0] !== "");
  }
  function calloutHTML(pn, H) {
    const cs = parseLines(pn.callouts).filter((a) => a.length >= 3);
    if (!cs.length) return "";
    const pts = cs.map(([x, y, ...lab]) => {
      const px = (+x / 100) * 1080, py = (+y / 100) * H;
      const lx = px < 540 ? px + 230 : px - 230, ly = Math.max(80, py - 90);
      return { px: r2(px), py: r2(py), lx: r2(lx), ly: r2(ly), lab: lab.join(",") };
    });
    return `<div class="sf-call"><svg class="sf-callsvg" width="1080" height="${H}" viewBox="0 0 1080 ${H}">` +
      pts.map((p, i) => `<path class="sf-cl-line" data-i="${i}" pathLength="100" d="M${p.px} ${p.py} L${p.lx} ${p.ly}"/><circle class="sf-cl-dot" data-i="${i}" cx="${p.px}" cy="${p.py}" r="14"/>`).join("") +
      `</svg>` + pts.map((p, i) => `<span class="sf-cl-lab" data-i="${i}" style="left:${p.lx}px;top:${p.ly}px">${esc(p.lab)}</span>`).join("") + `</div>`;
  }
  // 그림판: 막대 자라기 · 게이지 채우기 — chartData = "라벨,값" 줄마다 (말한 숫자만)
  function chartHTML(pn) {
    if (!pn.chart || pn.chart === "none") return "";
    const rows = parseLines(pn.chartData).map(([lab, val]) => ({ lab, val: parseFloat(val) || 0, raw: val }));
    if (!rows.length) return "";
    const max = parseFloat(pn.chartMax) || Math.max(...rows.map((r) => r.val)) || 1;
    const unit = esc(pn.chartUnit || "");
    if (pn.chart === "gauge") {
      return `<div class="sf-chart sf-gauge">` + rows.slice(0, 3).map((r) => `<div class="sf-gr"><div class="sf-gl"><b>${esc(r.lab)}</b><span class="sf-cv" data-v="${esc(r.raw)}">${esc(r.raw)}</span>${unit}</div><div class="sf-gt"><i class="sf-gf" data-k="${r2(Math.min(1, r.val / max))}"></i></div></div>`).join("") + `</div>`;
    }
    return `<div class="sf-chart sf-bars">` + rows.slice(0, 5).map((r) => `<div class="sf-bc"><span class="sf-bv"><span class="sf-cv" data-v="${esc(r.raw)}">${esc(r.raw)}</span>${unit}</span><i class="sf-bar" style="height:${r2(Math.max(0.04, Math.min(1, r.val / max)) * 300)}px"></i><span class="sf-bl">${esc(r.lab)}</span></div>`).join("") + `</div>`;
  }

  function renderBody(data, opts) {
    const d = defaults(data);
    const base = (opts && opts.base) || "";
    let track = 10;
    // 장면 컷 · 화면 녹화 · 사이드 창은 맨 아래(얼굴 바로 위)에 깔고, 위 글자 · 타일 · 스티커 · 훅 · 자막은 그 위
    const order = (o) => (o.kind === "insert" ? -1 : o.kind === "screen" ? 0 : o.kind === "aside" || o.kind === "wflist" || o.kind === "dm" ? 1 : 2);
    const list = d.overlays.map((o, i) => [o, i]).sort((a, b) => order(a[0]) - order(b[0]) || a[1] - b[1]).map((x) => x[0]);
    const ov = list
      .map((o) => {
        if (o.kind === "chat" && VIS_LAYOUTS[o.layout]) return visualHTML(o, d, base, "chat").replace('class="clip sf-panel sf-vis', 'class="clip sf-ov sf-vis');
        if (o.kind === "insert") {
          // 장면 컷: 다른 영상을 화면 전체로 덮음. from = 그 영상의 몇 초부터. 소리는 기본 끔(아바타 목소리는 계속)
          const muted = o.muted !== false;
          return `<video id="${CSS_ID(o.id)}" class="clip sf-ov sf-ins" data-kind="insert" src="${esc(base + (o.src || d.source))}"${muted ? " muted" : ""} playsinline data-start="${r2(o.start)}" data-duration="${r2(o.end - o.start)}" data-media-start="${r2(o.from || 0)}"${muted ? "" : ' data-has-audio="true"'} data-track-index="${track++}" style="${overlayBox(o)}"></video>` + transLayer(o);
        }
        let h = `<div id="${CSS_ID(o.id)}" class="clip sf-ov" data-kind="${esc(o.kind)}" data-start="${r2(o.start)}" data-duration="${r2(o.end - o.start)}" data-track-index="${track++}" style="${overlayBox(o)}">${overlayInner(o, base)}</div>`;
        if (o.kind === "screen" && o.src) {
          const w = o.w || 1000;
          h += `\n<video id="${CSS_ID(o.id)}_v" class="clip sf-scrv" src="${esc(base + o.src)}" muted playsinline data-start="${r2(o.start)}" data-duration="${r2(o.end - o.start)}" data-track-index="${track++}" style="left:${r2(o.x - w / 2)}px;top:${r2(o.y)}px;width:${w}px"></video>`;
        }
        return h;
      })
      .join("\n");
    const caps = d.captions
      .map((c) => {
        const v = capValues(c, d);
        const m = v.motion;
        const tr = v.align === "left" ? "none" : v.align === "right" ? "translateX(-100%)" : "translateX(-50%)";
        return `<div id="${CSS_ID(c.id)}" class="clip sf-cap sf-mo-${m}" data-start="${r2(c.start)}" data-duration="${r2(c.end - c.start)}" data-track-index="5" style="left:${c.x ?? 540}px;top:${capYFor(c, d, v.y)}px;transform:${tr};font-size:${capSize(c, v)}px"><span class="sf-m"><span class="sf-cl">${splitRich(capText(c, v), { chars: !!CHAR_MOTIONS[m], karaoke: m === "karaoke" || m === "outlineFill", marker: m === "marker", num: m === "numberRoll", tiers: v.fx === "twoTier", swap: m === "swap", emDeco: v.emMode })}</span></span></div>`;
      })
      .join("\n");
    // 훅 (고른 것 하나만)
    let hook = "";
    const h = pickedHook(d);
    if (h && h.text) {
      const v = headValues(h, d);
      const m = v.motion;
      const stk = h.sticker
        ? `<div class="sf-hook-stk">${/\.(png|webp|gif|jpe?g|svg)$/i.test(h.sticker) ? `<img src="${esc(base + h.sticker)}" style="height:1.3em;display:block">` : esc(h.sticker)}</div>`
        : "";
      const hf = hookSize(h, v);
      const flat = String(h.text).replace(/\*\*/g, "").replace(/\n/g, " ");
      let inner;
      if (m === "searchBar") {
        // 검색창 소품: 글자가 한 자씩 쳐지고 돋보기 버튼이 눌림 (글자 모양 값 대신 검색창 모양)
        const px = r2(Math.min(hf * 0.46, 700 / Math.max(4, textUnits(flat))));
        inner = `<div class="sf-search" style="font-size:${px}px"><span class="sf-sglass"></span><span class="sf-stext sf-ln">${splitRich(flat, { chars: true }).replace(/^<span class="sf-ln">|<\/span>$/g, "")}</span><span class="sf-caret"></span><span class="sf-sbtn">검색</span></div>`;
      } else {
        inner = `<div class="sf-head">${splitRich(v.fx === "twoTier" ? twoTierText(h.text) : h.text, { chars: !!CHAR_MOTIONS[m], karaoke: m === "karaoke" || m === "outlineFill", marker: m === "marker", num: m === "numberRoll", tiers: v.fx === "twoTier", swap: m === "swap", emDeco: v.emMode })}</div>`;
      }
      // 한 단어씩 화면 가득: 낱말마다 큰 글자 한 장씩 (화면 폭에 맞춤)
      const stomp = m === "stompWords"
        ? `<div class="sf-head sf-stomp">${flat.split(/\s+/).filter(Boolean).map((w) => `<span class="sf-ln sf-stw" style="font-size:${r2(Math.min(hf * 1.9, 900 / Math.max(1, textUnits(w)) / (v.boxOn ? 1.15 : 1)))}px">${esc(w)}</span>`).join("")}</div>`
        : "";
      hook = `<div id="sf-hook" class="clip sf-hook sf-mo-${m}" data-hook="${esc(h.id)}" data-start="${r2(h.start || 0)}" data-duration="${r2(Math.max(0.2, (h.end || 3) - (h.start || 0)))}" data-track-index="6" style="left:${(h.style && h.style.x) ?? 540}px;top:${v.y}px;font-size:${hf}px">` +
        `<div class="sf-m">${inner}</div>${stomp}${stk}</div>`;
    }
    // 기본 편집 틀: 위 제목 띠 · 반반 패널 · 글자 카드
    const hv0 = Object.assign({}, BASE.head, d.style.head);
    let lay = "";
    if (d.layout === "titleBand") {
      const b = d.band || {};
      lay += `<div id="sf-band" class="sf-band" style="height:${b.h || 360}px;background:${esc(b.bg || "#111214")};color:${esc(b.color || "#ffffff")};font-family:'${esc(hv0.font)}','Pretendard',sans-serif;font-weight:${hv0.weight}"><div class="sf-band-t" style="font-size:${b.size || 78}px">${rich(b.text || "제목 띠")}</div></div>`;
    }
    // 시각 자료(그림판): 자료마다 레이아웃
    for (const pn of d.panels || []) lay += visualHTML(pn, d, base, "panel");
    const sfx = (d.sfx || [])
      .map((x, i) => `<audio id="${CSS_ID(x.id)}" class="clip sf-sfx" src="${esc(base + x.file)}" data-start="${r2(x.start)}" data-duration="${r2(x.end - x.start)}" data-track-index="${40 + (i % 4)}" data-volume="${x.volume ?? 0.35}"></audio>`)
      .join("\n");
    return (
      `<div id="sf-lay" class="sf-layer"><div id="sf-cam" class="sf-layer"><div id="sf-fx" class="sf-layer"><div id="sf-shake" class="sf-layer"><div id="sf-filt" class="sf-layer">` +
      `<video id="footage" class="clip" src="${esc(d.source)}" data-start="0" data-duration="${r2(d.duration)}" data-track-index="0" data-has-audio="true"></video>` +
      `</div></div></div></div><div id="sf-flash" class="sf-layer"></div><div id="sf-spot" class="sf-layer"></div><div id="sf-dim" class="sf-layer"></div></div><div id="sf-ring"></div>\n${lay}\n${ov}\n${hook}\n${caps}\n${sfx}`
    );
  }

  const CSS = `
.sf-layer{position:absolute;inset:0;width:1080px;height:1920px;transform-origin:0 0}
#footage{position:absolute;inset:0;width:1080px;height:1920px;object-fit:cover}
.sf-ov{position:absolute}
.sf-card{position:relative !important;display:block !important;padding:12px;border-radius:24px;background:#fff;box-shadow:0 18px 40px rgba(0,0,0,.35)}
.sf-card-src{margin:10px 6px 2px;font-size:24px;font-weight:700;color:#6b6d75;letter-spacing:-0.02em;text-align:left}
.sf-tile{position:absolute;left:0;top:0;background:#fff;box-shadow:0 14px 34px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center}
.sf-paper{position:absolute;border-radius:10px;background:#fff;box-shadow:0 6px 16px rgba(0,0,0,.25);padding:12px 10px;opacity:0}
.sf-paper i{display:block;height:6px;margin-bottom:9px;border-radius:3px;background:#c9ccd3}
.sf-title{white-space:nowrap;font-weight:800;letter-spacing:-0.03em;padding:14px 28px;border-radius:18px}
.sf-cap{position:absolute;transform:translateX(-50%);white-space:nowrap;text-align:center;font-weight:700;letter-spacing:-0.03em;line-height:1.2;
  text-shadow:0 3px 14px rgba(0,0,0,.75),0 0 4px rgba(0,0,0,.7),0 0 1px rgba(0,0,0,.9)}
.sf-m{display:inline-block}
.sf-w,.sf-c{display:inline-block;white-space:pre}
.sf-num{font-variant-numeric:tabular-nums}
.sf-mo-words .sf-w,.sf-mo-typing .sf-c,.sf-mo-words .sf-ln,.sf-mo-typing .sf-ln{display:none}
.sf-w{position:relative}
.sf-kf{position:absolute;left:0;top:0;color:#ffd23f;clip-path:inset(0% 100% 0% 0%);white-space:pre}
.sf-cl,.sf-head{display:inline-block;position:relative}
.sf-head{white-space:nowrap}
.sf-cap em,.sf-head em,.sf-chapter em{font-style:normal}
.sf-mo-marker em,.sf-mo-marker .sf-cl,.sf-mo-marker .sf-head{isolation:isolate;position:relative}
.sf-mk{position:absolute;left:-.06em;right:-.06em;bottom:.08em;height:.42em;background:#ffd23f;opacity:.8;z-index:-1;transform-origin:0 50%;border-radius:.06em}
.sf-cap em,.sf-head em{font-size:calc(var(--emk,1) * 1em)}
.sf-hook{position:absolute;transform:translate(-50%,-50%);text-align:center}
.sf-hook .sf-head{font-size:1em}
.sf-hook-stk{position:absolute;right:-.35em;top:-.55em;font-size:.62em;line-height:1;transform:rotate(12deg)}
#sf-flash{background:#fff;opacity:0;pointer-events:none}
#sf-spot{opacity:0;pointer-events:none}
.sf-cap,.sf-hook{z-index:30}
.sf-ov{z-index:10}
.sf-panel{z-index:5}
#sf-ring{position:absolute;left:0;top:0;width:0;height:0;border:10px solid #ffffff;border-radius:50%;box-sizing:border-box;opacity:0;z-index:16;pointer-events:none;box-shadow:0 10px 0 rgba(0,0,0,.25)}
#sf-dim{background:#000;opacity:0;pointer-events:none}
.sf-vis{position:absolute;overflow:hidden;font-family:'Pretendard',sans-serif;letter-spacing:-0.03em}
.sf-vis.lay-float{border-radius:40px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.sf-vis .sf-pin{position:absolute;inset:auto;padding:0;display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:30px;border:0;background:none;text-align:center;box-sizing:border-box}
.sf-vt{font-size:60px;font-weight:800;line-height:1.2;letter-spacing:-0.04em;word-break:keep-all}
.sf-vt em,.sf-vx em{font-style:normal;background:linear-gradient(transparent 55%,var(--acc) 55%,var(--acc) 92%,transparent 92%)}
.sf-vx{font-size:42px;font-weight:600;line-height:1.4;color:#3d4148;word-break:keep-all}
.sf-t{width:100%}
.lay-full .sf-vt{font-size:74px}
.lay-full .sf-t:not(.sf-tcal):not(.sf-troute):not(.sf-tcmp),.lay-pip .sf-t:not(.sf-tcal):not(.sf-troute):not(.sf-tcmp){zoom:1.22}
.lay-full .sf-tcmp .sf-tlab,.lay-pip .sf-tcmp .sf-tlab{font-size:44px}
.lay-splitTop .sf-vt,.lay-splitBottom .sf-vt{font-size:54px}
.sf-tchk.compact .sf-tck{font-size:40px;gap:22px}
.sf-tchk.compact .sf-tbox{width:54px;height:54px}
.lay-float{height:auto !important}
.lay-float .sf-pin{position:relative !important;left:auto !important;top:auto !important;height:auto !important;margin:56px 50px 60px}
.sf-tcard{background:#ffffff;border-radius:24px;box-shadow:0 14px 36px rgba(17,17,20,.10),0 2px 6px rgba(17,17,20,.06);padding:48px 52px;box-sizing:border-box;color:#111214}
.sf-tnum .sf-tcard{display:flex;flex-direction:column;align-items:center;gap:20px;padding:56px 52px 60px}
.sf-tn{display:flex;align-items:baseline;justify-content:center;gap:14px;line-height:1}
.sf-tnv{font-size:220px;font-weight:900;letter-spacing:-0.05em;font-variant-numeric:tabular-nums}
.sf-tnu{font-size:76px;font-weight:800}
.sf-tbar{display:block;width:180px;height:16px;border-radius:8px;background:var(--acc);transform-origin:50% 50%}
.sf-tdesc{font-size:44px;font-weight:600;color:#4a4f57;word-break:keep-all}
.sf-tcmp{display:flex;align-items:center;gap:22px}
.sf-tcmp .sf-tcard{flex:1;display:flex;flex-direction:column;gap:16px;padding:48px 24px;min-height:260px;justify-content:center}
.sf-tcmp .sf-tc2{box-shadow:inset 0 0 0 6px var(--acc),0 14px 36px rgba(17,17,20,.10)}
.sf-tlab{font-size:40px;font-weight:700;color:#6b7079}
.sf-tval{font-size:54px;font-weight:800;line-height:1.2;word-break:keep-all;text-wrap:balance}
.sf-tarrow{flex:none;width:84px;height:84px;border-radius:50%;background:#111214;color:#ffffff;display:flex;align-items:center;justify-content:center}
.sf-tarrow svg{width:48px;height:48px}
.sf-tchk .sf-tcard{padding:20px 44px}
.sf-tck{display:flex;align-items:center;gap:30px;text-align:left;font-size:46px;font-weight:700;border-bottom:2px solid #eef0f3}
.sf-tck:last-child{border-bottom:0}
.sf-tbox{width:68px;height:68px;flex:none;overflow:visible}
.sf-tboxr{fill:var(--acc);stroke:#111214;stroke-width:4}
.sf-tchkp{fill:none;stroke:#111214;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:0}
.sf-tcal .sf-tcard{padding:36px 40px 30px}
.sf-tcalh{display:flex;align-items:baseline;gap:16px;margin-bottom:12px}
.sf-tcalh b{font-size:56px;font-weight:800}
.sf-tcalh span{font-size:36px;font-weight:600;color:#7a7f87}
.sf-twk,.sf-tgrid{display:grid;grid-template-columns:repeat(7,1fr)}
.sf-twk span{font-size:34px;font-weight:700;color:#7a7f87;padding:6px 0}
.sf-twk .sun,.sf-tday.sun{color:#e03131}
.sf-tday{position:relative;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:600}
.sf-tday.out{visibility:hidden}
.sf-tday.mk b{font-weight:900}
.sf-tday b{position:relative;font-weight:600}
.sf-tring{position:absolute;left:50%;top:50%;width:88px;height:88px;margin:-44px 0 0 -44px;overflow:visible}
.sf-tring circle{fill:var(--acc);fill-opacity:.35;stroke:#111214;stroke-width:6;stroke-dasharray:100;stroke-dashoffset:0;transform:rotate(-90deg);transform-origin:50% 50%}
.sf-tgaps{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:22px;flex-wrap:wrap}
.sf-tgl{font-size:36px;font-weight:700;color:#4a4f57;margin-right:6px}
.sf-tgap{font-size:38px;font-weight:800;background:var(--acc);color:var(--acct);border-radius:999px;padding:6px 22px}
.sf-troute .sf-tcard{position:relative;padding:40px 60px 44px}
.sf-tmap{display:block;overflow:visible}
.sf-tpath0{fill:none;stroke:#cfd4da;stroke-width:10;stroke-linecap:round;stroke-dasharray:4 22}
.sf-tpath{fill:none;stroke:#111214;stroke-width:10;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:0}
.sf-tdot0{fill:#111214}
.sf-tdot1{fill:var(--acc);stroke:#111214;stroke-width:7}
.sf-tveh{position:absolute;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;background:#111214;color:#ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 0 rgba(0,0,0,.18)}
.sf-tveh svg{width:46px;height:46px}
.sf-tends{display:flex;justify-content:space-between;margin-top:8px}
.sf-tends div{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:200px}
.sf-tends span{font-size:34px;font-weight:700;color:#7a7f87}
.sf-tends b{font-size:58px;font-weight:800}
.lay-full .sf-tends b,.lay-pip .sf-tends b{font-size:70px}
.lay-full .sf-tends span,.lay-pip .sf-tends span{font-size:40px}
.sf-tquote .sf-tcard{text-align:left;padding:56px 60px;display:flex;flex-direction:column;gap:26px}
.sf-tqm{display:block;width:96px;height:72px;color:var(--acc);filter:drop-shadow(0 3px 0 #111214)}
.sf-tqm svg{width:100%;height:100%}
.sf-tqt{font-size:58px;font-weight:800;line-height:1.3;word-break:keep-all}
.sf-tqs{font-size:40px;font-weight:700;color:#6b7079}
.sf-ttl .sf-tcard{display:flex;flex-direction:column;gap:34px;text-align:left}
.sf-trh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}
.sf-trh b{font-size:44px;font-weight:800}
.sf-trh span{font-size:44px;font-weight:900}
.sf-ttrack{height:52px;border-radius:999px;background:#eef0f3;overflow:hidden}
.sf-tfill{display:block;height:100%;border-radius:999px;background:var(--acc);box-shadow:inset 0 0 0 4px rgba(17,18,20,.85);transform-origin:0 50%}
.sf-chat2{position:relative;margin:0 auto;font-family:'Pretendard',sans-serif;letter-spacing:-0.02em;text-align:left;color:#191919}
.sf-chat2.framed{border:16px solid #111214;border-radius:72px;box-shadow:0 26px 60px rgba(0,0,0,.35);box-sizing:border-box;background:#111214}
.sf-cscr{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--cbg);overflow:hidden}
.sf-chat2.framed .sf-cscr{border-radius:56px}
.sf-cstat{flex:none;height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 46px;background:var(--chead);color:var(--cht)}
.sf-cstat b{font-size:34px;font-weight:700;letter-spacing:0}
.sf-cico{display:flex;gap:12px;align-items:center}
.sf-cico svg{height:24px;width:auto}
.sf-chead{flex:none;height:104px;display:flex;align-items:center;gap:16px;padding:0 30px;background:var(--chead);color:var(--cht);border-bottom:1px solid rgba(0,0,0,.06)}
.sf-chead b{flex:1;font-size:42px;font-weight:800}
.sf-cbk svg,.sf-chic svg{width:44px;height:44px;display:block}
.sf-chic{display:flex;gap:24px}
.sf-cbody{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:0;padding:10px 26px 18px;overflow:hidden}
.sf-cdate{display:flex;justify-content:center;margin:10px 0 18px}
.sf-cdate span{font-size:32px;font-weight:600;background:var(--cchip);color:var(--cchipt);border-radius:999px;padding:6px 24px}
.sf-cm{overflow:hidden}
.sf-crow{display:flex;align-items:flex-start;gap:16px;padding:10px 0}
.sf-cm.me .sf-crow{justify-content:flex-end;align-items:flex-end}
.sf-cav{flex:none;width:92px;height:92px;border-radius:34px;background:#a9b8c6;display:flex;align-items:flex-end;justify-content:center;overflow:hidden}
.sf-cav svg{width:84%;height:84%}
.sf-ccol{display:flex;flex-direction:column;gap:6px;min-width:0}
.sf-cname{font-size:32px;font-weight:600;color:#33393f}
.sf-cline{display:flex;align-items:flex-end;gap:12px}
.sf-cbub{position:relative;max-width:560px;font-size:40px;font-weight:500;line-height:1.38;padding:18px 26px;border-radius:30px;word-break:keep-all;white-space:pre-wrap}
.sf-cbub.tt::before{content:"";position:absolute;top:0;width:28px;height:28px;background:var(--tail)}
.sf-cm.them .sf-cbub.tt{border-top-left-radius:8px}
.sf-cm.me .sf-cbub.tt{border-top-right-radius:8px}
.sf-cm.them .sf-cbub.tt::before{left:-14px;clip-path:polygon(100% 0,0 0,100% 100%)}
.sf-cm.me .sf-cbub.tt::before{right:-14px;clip-path:polygon(0 0,100% 0,0 100%)}
.sf-cbub.tb::before{content:"";position:absolute;bottom:0;width:30px;height:34px;background:var(--tail)}
.sf-cm.them .sf-cbub.tb{border-bottom-left-radius:10px}
.sf-cm.me .sf-cbub.tb{border-bottom-right-radius:10px}
.sf-cm.them .sf-cbub.tb::before{left:-12px;clip-path:polygon(100% 0,100% 100%,0 100%)}
.sf-cm.me .sf-cbub.tb::before{right:-12px;clip-path:polygon(0 0,0 100%,100% 100%)}
.sf-cmeta{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:0;line-height:1.15;padding-bottom:4px}
.sf-cm.them .sf-cmeta{align-items:flex-start}
.sf-cmeta i{font-style:normal;font-size:32px;font-weight:500;color:#4d5560;white-space:nowrap}
.sf-cun{font-size:32px;font-weight:800}
.sf-chl{font-style:normal;background:linear-gradient(transparent 52%,#ffe14d 52%,#ffe14d 94%,transparent 94%)}
.sf-cdots{display:flex;gap:12px;padding:26px 30px}
.sf-cdots i{width:16px;height:16px;border-radius:50%;background:#8a939c}
.sf-ctyp .sf-cav{background:transparent}
.sf-cin{flex:none;height:118px;display:flex;align-items:center;gap:18px;padding:0 26px;background:#ffffff;color:#5a6068;border-top:1px solid rgba(0,0,0,.06)}
.sf-cplus svg,.sf-cemo svg{width:46px;height:46px;display:block}
.sf-cfield{flex:1;font-size:34px;font-weight:500;color:#9aa1a9;background:#f2f3f5;border-radius:999px;padding:14px 28px}
.sf-csend{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.sf-csend svg{width:36px;height:36px}
.sf-chat{border-radius:34px;overflow:hidden;font-family:'Pretendard',sans-serif;letter-spacing:-0.03em;text-align:left;box-shadow:0 10px 0 rgba(0,0,0,.25)}
.sf-chat-top{display:flex;align-items:center;gap:18px;padding:22px 30px;background:rgba(255,255,255,.55);font-size:38px;color:#111}
.sf-cav,.sf-mav{display:inline-block;width:64px;height:64px;border-radius:50%;background:#e9eef2;border:3px solid rgba(0,0,0,.12);flex:none}
.sf-chat-body{display:flex;flex-direction:column;gap:22px;padding:28px 26px 34px}
.sf-msg{position:relative;display:flex;align-items:flex-start;gap:14px;opacity:0}
.sf-me{justify-content:flex-end}
.sf-mcol{display:flex;flex-direction:column;gap:6px;max-width:74%}
.sf-me .sf-mcol{align-items:flex-end}
.sf-mname{font-size:28px;color:#333;font-weight:600}
.sf-mrow{display:flex;align-items:flex-end;gap:10px}
.sf-bub{font-size:40px;font-weight:600;line-height:1.35;padding:18px 26px;border-radius:30px;word-break:keep-all;white-space:pre-wrap}
.sf-them .sf-bub{border-top-left-radius:8px}
.sf-me .sf-bub{border-top-right-radius:8px}
.sf-meta{display:flex;flex-direction:column;align-items:flex-end;font-size:22px;color:#4a5560;font-weight:600;white-space:nowrap;line-height:1.2}
.sf-them .sf-meta{align-items:flex-start}
.sf-read{color:#4a5560}
.sf-chl{font-style:normal;background:linear-gradient(transparent 50%,#fff36b 50%,#fff36b 92%,transparent 92%)}
.sf-dots{position:absolute;top:0;display:flex;gap:9px;padding:20px 24px;border-radius:30px;opacity:0}
.sf-them .sf-dots{left:78px}
.sf-me .sf-dots{right:0}
.sf-dots i{width:13px;height:13px;border-radius:50%;background:#7a8590}
.sf-swapbox{display:inline-grid;vertical-align:bottom;clip-path:inset(-.12em -.3em -.2em -.3em)}
.sf-swi{grid-area:1/1;justify-self:center}
.sf-mo-swap .sf-swi{opacity:0}
.sf-mo-swap .sf-swi:first-child{opacity:1}
.sf-mo-wipe .sf-ln{-webkit-mask-image:linear-gradient(90deg,#000 calc(var(--wp,112) * 1% - 12%),transparent calc(var(--wp,112) * 1%));mask-image:linear-gradient(90deg,#000 calc(var(--wp,112) * 1% - 12%),transparent calc(var(--wp,112) * 1%))}
.sf-mo-stopMotion .sf-w,.sf-mo-stopMotion .sf-ln{display:none}
.sf-search{display:inline-flex;align-items:center;gap:.4em;background:#ffffff;color:#111111;border:.09em solid #111111;border-radius:999px;padding:.38em .5em .38em .7em;font-family:'Pretendard',sans-serif;font-weight:700;letter-spacing:-0.02em;box-shadow:0 .14em 0 rgba(0,0,0,.45);white-space:nowrap;text-shadow:none;-webkit-text-stroke:0}
.sf-search .sf-stext{display:inline-block;min-width:6em;text-align:left;line-height:1.2;background:none;padding:0;margin:0}
.sf-sglass{position:relative;width:.62em;height:.62em;border:.12em solid #111;border-radius:50%;flex:none;margin-right:.1em}
.sf-sglass::after{content:"";position:absolute;right:-.3em;bottom:-.26em;width:.32em;height:.12em;background:#111;rotate:45deg;border-radius:.06em}
.sf-caret{display:inline-block;width:.08em;height:1.05em;background:#111;margin-left:-.3em}
.sf-sbtn{background:#111;color:#fff;border-radius:999px;padding:.12em .6em;font-size:.8em}
.sf-stomp{position:absolute;left:50%;top:50%;width:0;height:0}
.sf-stomp .sf-stw{position:absolute;left:0;top:0;opacity:0;white-space:nowrap}
.sf-tw{position:absolute;left:0;top:0;width:1080px;height:1920px;pointer-events:none;transform:translateX(-1300px)}
.sf-tw-leak{width:760px;left:160px;background:linear-gradient(90deg,transparent 0 8%,rgba(255,178,92,.5) 8% 26%,rgba(255,226,170,.85) 26% 50%,rgba(255,150,80,.55) 50% 74%,transparent 74%);mix-blend-mode:screen;transform:translateX(-1300px) skewX(-16deg)}
.sf-call{position:absolute;inset:0;pointer-events:none}
.sf-callsvg{position:absolute;left:0;top:0;overflow:visible}
.sf-cl-line{fill:none;stroke:#111;stroke-width:6;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:0}
.sf-cl-dot{fill:#e03131;stroke:#ffffff;stroke-width:5}
.sf-cl-lab{position:absolute;transform:translate(-50%,-50%);background:#111;color:#fff;font-size:44px;font-weight:800;padding:8px 22px;white-space:nowrap;letter-spacing:-0.03em}
.sf-chart{display:flex;align-items:flex-end;justify-content:center;gap:34px;font-family:'Pretendard',sans-serif}
.sf-bc{display:flex;flex-direction:column;align-items:center;gap:10px}
.sf-bar{display:block;width:110px;background:#e9ed12;border:5px solid #111;transform-origin:50% 100%}
.sf-bv{font-size:44px;font-weight:900;font-variant-numeric:tabular-nums}
.sf-bl{font-size:34px;font-weight:700}
.sf-gauge{flex-direction:column;align-items:stretch;gap:26px;width:860px}
.sf-gl{display:flex;justify-content:space-between;font-size:40px;font-weight:800;font-variant-numeric:tabular-nums}
.sf-gl b{margin-right:auto}
.sf-gt{height:44px;border:5px solid #111;background:#ffffff}
.sf-gf{display:block;height:100%;background:#e9ed12;transform-origin:0 50%}
.sf-ins{position:absolute;object-fit:cover;background:#000}
.sf-band{position:absolute;left:0;top:0;width:1080px;display:flex;align-items:flex-end;justify-content:center;padding:0 50px 46px;box-sizing:border-box;text-align:center;line-height:1.15;letter-spacing:-0.03em}
.sf-band-t{white-space:nowrap}
.sf-band em,.sf-pin em{font-style:normal;color:#ffd23f}
.sf-panel{position:absolute;left:0;top:0;width:1080px;overflow:hidden}
.sf-pin{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:110px 70px 60px;box-sizing:border-box;text-align:center;letter-spacing:-0.03em}
.sf-panel-split .sf-pin{border-bottom:8px solid rgba(0,0,0,.85)}
.sf-pt{font-size:92px;line-height:1.15;word-break:keep-all}
.sf-px{font-size:52px;line-height:1.4;font-weight:600;word-break:keep-all;opacity:.88}
.sf-pimg{max-width:860px;max-height:420px;object-fit:contain;border-radius:24px;box-shadow:0 16px 40px rgba(0,0,0,.25)}
.sf-panel-card .sf-pt{font-size:120px}
.sf-stk{position:relative}
.sf-stk-i{display:block;transform-origin:50% 90%}
.sf-quiz{width:940px;border-radius:30px;background:linear-gradient(180deg,#fff 0%,#f3f3f5 100%);box-shadow:0 30px 70px rgba(0,0,0,.35),0 0 0 2px rgba(17,18,20,.08);font-family:"Pretendard",sans-serif}
.sf-quiz-bar{height:70px;display:flex;align-items:center;gap:12px;padding:0 26px;border-bottom:2px solid #e3e4e8}
.sf-quiz-bar span{width:18px;height:18px;border-radius:50%}
.sf-quiz-bar em{font-style:normal;margin-left:18px;flex:1;height:42px;border-radius:12px;background:#ececef;display:flex;align-items:center;padding:0 18px;font-size:30px;font-weight:600;color:#5a5c63}
.sf-quiz-body{padding:30px 40px 40px}
.sf-quiz-q{display:flex;align-items:center;gap:18px}
.sf-quiz-q .n{width:58px;height:58px;border-radius:50%;background:#111214;color:#fff;font-weight:900;font-size:32px;display:flex;align-items:center;justify-content:center;flex:none}
.sf-quiz-q .t{font-weight:800;font-size:44px;letter-spacing:-0.04em;color:#111214;white-space:nowrap}
.sf-quiz-q .d{margin-left:auto;display:flex;gap:8px}
.sf-quiz-q .d i{width:16px;height:16px;border-radius:50%;background:#d4d5da}
.sf-quiz-q .d i.on{background:#ff6b1a}
.sf-quiz-grid{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:20px}
.sf-key{height:104px;border-radius:24px;background:#fff;border:2px solid #d9dade;box-shadow:0 10px 0 #cfd0d6,0 18px 26px rgba(0,0,0,.16);display:flex;align-items:center;gap:14px;padding:0 24px;font-weight:700;font-size:36px;letter-spacing:-0.035em;color:#111214;white-space:nowrap}
.sf-key b{width:46px;height:46px;border-radius:12px;background:#f0f0f3;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:28px;flex:none}
.sf-key.etc{color:#6b6d75}
.sf-scr-bg{position:absolute;inset:0}
.sf-scrv{position:absolute;border-radius:26px;box-shadow:0 30px 70px rgba(0,0,0,.35),0 0 0 2px rgba(17,18,20,.1);background:#111}
.ax-wrap{position:absolute;inset:0;font-family:"Pretendard",sans-serif;color:#111214}
.ax-bg{position:absolute;inset:0;background:linear-gradient(180deg,#eef0f4 0%,#e2e5eb 100%);border-bottom:4px solid #111214}
.ax-win{position:absolute;left:30px;top:36px;width:1020px;height:890px;border-radius:28px;background:#fff;box-shadow:0 24px 60px rgba(0,0,0,.18),0 0 0 2px rgba(17,18,20,.06);overflow:hidden}
.ax-top{height:76px;display:flex;align-items:center;gap:12px;padding:0 26px;border-bottom:2px solid #ececf0}
.ax-top .d{width:16px;height:16px;border-radius:50%}
.ax-brand{margin-left:14px;display:flex;align-items:center;gap:10px;font-weight:900;font-size:30px;letter-spacing:-0.02em}
.ax-brand i{width:30px;height:30px;border-radius:9px;background:#111214;display:inline-block;box-shadow:inset -8px 0 0 #ff6b1a}
.ax-new{margin-left:auto;font-size:24px;font-weight:700;color:#5a5c63;background:#f2f2f5;padding:8px 16px;border-radius:12px}
.ax-chat{position:absolute;left:0;right:0;top:76px;bottom:150px;padding:26px 34px;display:flex;flex-direction:column;gap:16px;overflow:hidden}
.ax-empty{position:absolute;left:0;right:0;top:40%;text-align:center;font-size:36px;font-weight:800;color:#b5b7be;letter-spacing:-0.03em}
.ax-user{align-self:flex-end;max-width:860px;height:300px;overflow:hidden;flex:none;
  -webkit-mask-image:linear-gradient(180deg,#000 70%,transparent);mask-image:linear-gradient(180deg,#000 70%,transparent)}
.ax-ubub{background:#f1f1f4;border-radius:24px 24px 6px 24px;padding:16px 22px;font-size:19px;line-height:1.45;font-weight:500;letter-spacing:-0.02em;color:#26272b}
.ax-ai{display:flex;align-items:center;gap:14px;flex:none}
.ax-av{width:46px;height:46px;border-radius:14px;background:#111214;color:#fff;font-weight:900;font-size:24px;display:flex;align-items:center;justify-content:center;flex:none}
.ax-typing{display:flex;gap:7px;width:60px;overflow:hidden}
.ax-typing i{width:12px;height:12px;border-radius:50%;background:#9a9ca4}
.ax-aimsg{font-size:27px;font-weight:600;letter-spacing:-0.03em;white-space:nowrap}
.ax-qs{position:relative;flex:1}
.ax-q{position:absolute;left:0;right:0;top:0}
.ax-qh{display:flex;align-items:center;gap:14px}
.ax-qn{background:#111214;color:#fff;font-weight:900;font-size:24px;padding:6px 14px;border-radius:999px}
.ax-qt{font-size:36px;font-weight:800;letter-spacing:-0.04em;white-space:nowrap}
.ax-dots{margin-left:auto;display:flex;gap:7px}
.ax-dots i{width:14px;height:14px;border-radius:50%;background:#d4d5da}
.ax-dots i.on{background:#ff6b1a}
.ax-opts{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ax-opt{height:84px;border-radius:20px;background:#fff;border:2px solid #d9dade;box-shadow:0 8px 0 #cfd0d6,0 14px 22px rgba(0,0,0,.12);display:flex;align-items:center;gap:12px;padding:0 20px;font-weight:700;font-size:29px;letter-spacing:-0.035em;white-space:nowrap}
.ax-opt b{width:40px;height:40px;border-radius:11px;background:#f0f0f3;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:24px;flex:none}
.ax-opt.etc{color:#6b6d75}
.ax-input{position:absolute;left:24px;right:24px;bottom:24px;background:#fff;border:2px solid #e3e4e8;border-radius:24px;padding:18px 22px 76px;box-shadow:0 10px 30px rgba(0,0,0,.12)}
.ax-ph{font-size:27px;font-weight:500;color:#7d7f87;position:absolute;left:84px;bottom:22px}
.ax-typed{overflow:hidden;font-size:19px;line-height:1.45;font-weight:500;letter-spacing:-0.02em;color:#26272b;margin-top:2px}
.ax-ibar{position:absolute;left:18px;right:18px;bottom:12px;display:flex;align-items:center;justify-content:space-between}
.ax-plus{width:48px;height:48px;border-radius:50%;background:#f2f2f5;display:flex;align-items:center;justify-content:center;font-size:28px;color:#5a5c63}
.ax-send{width:54px;height:54px;border-radius:50%;background:#111214;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900}
.dm-card{position:absolute;left:90px;top:220px;width:900px;background:#fff;border-radius:30px;box-shadow:0 26px 60px rgba(0,0,0,.2),0 0 0 2px rgba(17,18,20,.06);padding:26px 28px;font-family:"Pretendard",sans-serif;color:#111214}
.dm-row1{display:flex;align-items:center;gap:14px}
.dm-av{width:56px;height:56px;border-radius:50%;background:conic-gradient(#ff6b1a,#ff3b5c,#7b5cff,#ff6b1a);box-shadow:inset 0 0 0 5px #fff}
.dm-name{font-size:30px;font-weight:800;letter-spacing:-0.03em;margin-right:auto}
.dm-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:170px;height:62px;border-radius:16px;border:2px solid #d9dade;background:#f4f4f6;font-size:27px;font-weight:800;letter-spacing:-0.03em}
.dm-btn em{font-style:normal;position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.dm-cmt{position:relative;margin-top:18px;height:76px;border-radius:20px;border:2px solid #e1e2e6;display:flex;align-items:center;padding:0 22px;font-size:29px;font-weight:600}
.dm-ph{position:absolute;left:22px;color:#9a9ca4}
.dm-typed{display:flex}
.dm-typed i{font-style:normal}
.dm-post{margin-left:auto;font-size:25px;font-weight:800;color:#8ab8e6;padding:8px 18px;border-radius:12px}
.dm-box{margin-top:18px;overflow:hidden;border-radius:22px;background:#f4f5f8}
.dm-head{padding:18px 22px 4px;font-size:27px;font-weight:900;letter-spacing:-0.03em}
.dm-head span{margin-left:10px;font-size:21px;font-weight:600;color:#8a8c94}
.dm-msg{margin:8px 22px 0;display:inline-block;background:#3797f0;color:#fff;font-size:26px;font-weight:700;padding:12px 20px;border-radius:22px 22px 22px 6px;letter-spacing:-0.02em}
.dm-prompt{margin:14px 22px 0;height:250px;overflow:hidden;background:#fff;border-radius:16px;padding:16px 18px;
  -webkit-mask-image:linear-gradient(180deg,#000 75%,transparent);mask-image:linear-gradient(180deg,#000 75%,transparent)}
.dm-ln{font-size:21px;line-height:1.5;font-weight:500;letter-spacing:-0.02em;color:#26272b}
.wf-body{position:absolute;left:0;right:0;top:76px;bottom:0;padding:26px 34px}
.wf-lab{margin:22px 0 12px;font-size:27px;font-weight:800;letter-spacing:-0.03em;color:#3a3b40}
.wf-row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.wf-card{position:relative;height:214px;border-radius:22px;background:#fff;border:2px solid #e1e2e6;box-shadow:0 10px 22px rgba(0,0,0,.10);padding:20px 20px 16px;display:flex;flex-direction:column;gap:6px}
.wf-emo{font-size:44px;line-height:1}
.wf-t{font-size:29px;font-weight:800;letter-spacing:-0.045em;line-height:1.22;color:#111214;word-break:keep-all}
.wf-s{margin-top:auto;font-size:21px;font-weight:600;color:#7a7c84;letter-spacing:-0.02em}
.wf-badge{position:absolute;right:14px;top:14px;background:#ff6b1a;color:#111214;font-weight:900;font-size:21px;padding:4px 12px;border-radius:999px}
.ax-cursor{position:absolute;left:0;top:0;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
`;

  // ── 카메라 값 계산: 기준점(ax, ay)을 중심으로 scale 배 → translate 값 ──
  function camXY(k) {
    const s = k.scale ?? 1;
    return { x: r2((k.ax ?? 540) * (1 - s)), y: r2((k.ay ?? 800) * (1 - s)), scale: s };
  }

  // ── 효과 하나를 타임라인에 넣음 ──
  function applyEffect(tl, e, L) {
    const { fx, sh, filt, flash } = L;
    const k = e.strength ?? 1;
    const s = e.start, E = e.end;
    const D = Math.max(0.05, E - s);
    const ax = e.ax ?? 540, ay = e.ay ?? 800;
    const at = (sc) => camXY({ scale: sc, ax, ay });
    const to = (el, vars, t) => tl.to(el, vars, t);
    // 이징: smooth(부드럽게, 효과마다 기본) · snap(툭) · bounce(튕김)
    const ez = (def) => (e.ease === "snap" ? "expo.out" : e.ease === "bounce" ? "back.out(2.4)" : def);
    const pivot = { transformOrigin: `${ax}px ${ay}px` };
    switch (e.type) {
      case "zoomIn": if (!fx) break; tl.set(fx, at(1), s); to(fx, Object.assign({ duration: D, ease: ez("power2.out") }, at(1 + 0.12 * k)), s); tl.set(fx, at(1), E); break;
      case "zoomOut": if (!fx) break; tl.set(fx, at(1 + 0.12 * k), s); to(fx, Object.assign({ duration: D, ease: ez("power2.out") }, at(1)), s); break;
      case "punch": if (!fx) break; tl.set(fx, at(1 + 0.15 * k), s); tl.set(fx, at(1), E); break;
      case "punchOut": if (!fx) break; tl.set(fx, at(1 + 0.2 * k), s); to(fx, Object.assign({ duration: Math.min(0.16, D), ease: ez("power3.out") }, at(1)), s); break;
      case "slowPush": if (!fx) break; tl.set(fx, at(1), s); to(fx, Object.assign({ duration: D, ease: ez("none") }, at(1 + 0.06 * k)), s); tl.set(fx, at(1), E); break;
      case "snapZoom": if (!fx) break; tl.set(fx, at(1), s); to(fx, Object.assign({ duration: Math.min(0.14, D / 3), ease: ez("power3.out") }, at(1 + 0.25 * k)), s);
        to(fx, Object.assign({ duration: Math.min(0.2, D / 3), ease: ez("power2.inOut") }, at(1)), E - Math.min(0.2, D / 3)); break;
      case "doublePunch": if (!fx) break; tl.set(fx, at(1 + 0.1 * k), s); tl.set(fx, at(1 + 0.22 * k), s + D / 2); tl.set(fx, at(1), E); break;
      case "crash": if (!fx) break; tl.set(fx, at(1), s); to(fx, Object.assign({ duration: Math.min(0.16, D / 2), ease: ez("power4.in") }, at(1 + 0.35 * k)), s);
        if (flash) { tl.set(flash, { backgroundColor: "#ffffff", opacity: 0 }, s); to(flash, { opacity: 0.9, duration: 0.04 }, s + 0.14); to(flash, { opacity: 0, duration: 0.35, ease: ez("power2.out") }, s + 0.18); }
        tl.set(fx, at(1), E); break;
      case "blurZoom": if (!fx) break; tl.set(fx, at(1), s); to(fx, Object.assign({ duration: D * 0.5, ease: ez("power2.in") }, at(1 + 0.15 * k)), s);
        if (filt) { tl.set(filt, { filter: "blur(0px) grayscale(0)" }, s); to(filt, { filter: `blur(${r2(10 * k)}px) grayscale(0)`, duration: D * 0.5, ease: ez("power2.in") }, s); to(filt, { filter: "blur(0px) grayscale(0)", duration: D * 0.5, ease: ez("power2.out") }, s + D * 0.5); }
        tl.set(fx, at(1), E); break;
      case "rotateZoom": if (!fx || !sh) break; tl.set(fx, at(1), s); tl.set(sh, Object.assign({ rotation: 0 }, pivot), s);
        to(fx, Object.assign({ duration: D, ease: ez("power2.inOut") }, at(1 + 0.18 * k)), s); to(sh, { rotation: r2(4 * k), duration: D, ease: ez("power2.inOut") }, s);
        tl.set(fx, at(1), E); tl.set(sh, { rotation: 0 }, E); break;
      case "bounceZoom": if (!fx) break; tl.set(fx, at(1), s);
        to(fx, { keyframes: [Object.assign({ duration: 0.16, ease: ez("power2.out") }, at(1 + 0.18 * k)), Object.assign({ duration: 0.12, ease: ez("power1.inOut") }, at(1 + 0.07 * k)), Object.assign({ duration: 0.1, ease: ez("power1.inOut") }, at(1 + 0.13 * k)), Object.assign({ duration: 0.1, ease: ez("power1.inOut") }, at(1 + 0.1 * k))] }, s);
        to(fx, Object.assign({ duration: 0.15, ease: ez("power2.in") }, at(1)), Math.max(s + 0.5, E - 0.15)); break;
      case "heartbeat": if (!fx) break; tl.set(fx, at(1), s);
        to(fx, { keyframes: [Object.assign({ duration: 0.1, ease: ez("power2.out") }, at(1 + 0.08 * k)), Object.assign({ duration: 0.12, ease: ez("power2.in") }, at(1)), Object.assign({ duration: 0.08 }, at(1)), Object.assign({ duration: 0.1, ease: ez("power2.out") }, at(1 + 0.11 * k)), Object.assign({ duration: 0.16, ease: ez("power2.in") }, at(1))] }, s); break;
      case "zoomHold": if (!fx) break; tl.set(fx, at(1), s); to(fx, Object.assign({ duration: Math.min(0.35, D), ease: ez("power3.out") }, at(1 + 0.15 * k)), s); tl.set(fx, at(1), E); break;
      case "zoomReveal": if (!fx) break; tl.set(fx, at(1 + 0.4 * k), s); to(fx, Object.assign({ duration: D, ease: ez("power2.inOut") }, at(1)), s); break;
      case "kenBurns": { if (!fx) break; const s0 = 1 + 0.05 * k, s1 = 1 + 0.16 * k;
        tl.set(fx, camXY({ scale: s0, ax: Math.max(0, ax - 260), ay: Math.min(1920, ay + 160) }), s); to(fx, Object.assign({ duration: D, ease: ez("sine.inOut") }, camXY({ scale: s1, ax, ay })), s); tl.set(fx, at(1), E); break; }
      case "panLR": { if (!fx) break; const sc = 1 + 0.15 * k; tl.set(fx, { scale: sc, x: 0, y: r2(ay * (1 - sc)) }, s); to(fx, { x: r2(1080 * (1 - sc)), duration: D, ease: ez("sine.inOut") }, s); tl.set(fx, at(1), E); break; }
      case "tiltUD": { if (!fx) break; const sc = 1 + 0.15 * k; tl.set(fx, { scale: sc, x: r2(ax * (1 - sc)), y: 0 }, s); to(fx, { y: r2(1920 * (1 - sc)), duration: D, ease: ez("sine.inOut") }, s); tl.set(fx, at(1), E); break; }
      case "dutch": if (!fx || !sh) break; tl.set(fx, at(1), s); tl.set(sh, Object.assign({ rotation: 0 }, pivot), s);
        to(fx, Object.assign({ duration: 0.25, ease: ez("power3.out") }, at(1 + 0.14 * k)), s); to(sh, { rotation: r2(-5 * k), duration: 0.25, ease: ez("power3.out") }, s);
        tl.set(fx, at(1), E); tl.set(sh, { rotation: 0 }, E); break;
      case "shake": { if (!sh) break;
        // 정해진 순서로만 흔든다 (무작위 없음)
        const steps = Math.max(2, Math.round(D / 0.05));
        const amp = 14 * k;
        const frames = [];
        for (let i = 1; i <= steps; i++) {
          const decay = 1 - i / steps;
          frames.push({ x: r2(amp * decay * (i % 2 ? 1 : -1)), rotation: r2(1.2 * k * decay * (i % 3 === 0 ? -1 : 1)), duration: D / steps, ease: ez("none") });
        }
        frames[frames.length - 1] = { x: 0, rotation: 0, duration: D / steps, ease: ez("none") };
        tl.set(sh, { transformOrigin: "50% 50%" }, s);
        to(sh, { keyframes: frames }, s); break; }
      case "handheld": { if (!sh) break;
        // 사인 곡선으로 잔잔히 (가장자리가 보이지 않게 살짝 확대)
        if (fx) { tl.set(fx, at(1 + 0.04 * k), s); tl.set(fx, at(1), E); }
        const n = Math.max(2, Math.round(D / 0.3));
        const frames = [];
        for (let i = 1; i <= n; i++) {
          const last = i === n;
          frames.push({ x: last ? 0 : r2(7 * k * Math.sin(i * 1.7)), y: last ? 0 : r2(6 * k * Math.cos(i * 1.3)), rotation: last ? 0 : r2(0.35 * k * Math.sin(i * 0.9)), duration: D / n, ease: ez("sine.inOut") });
        }
        tl.set(sh, { transformOrigin: "50% 50%" }, s);
        to(sh, { keyframes: frames }, s); break; }
      case "flash": if (!flash) break; tl.set(flash, { backgroundColor: "#ffffff", opacity: 0 }, s);
        to(flash, { opacity: Math.min(1, 0.85 * k), duration: 0.05 }, s); to(flash, { opacity: 0, duration: Math.max(0.1, D - 0.05), ease: ez("power2.out") }, s + 0.05); break;
      case "dipBlack": if (!flash) break; tl.set(flash, { backgroundColor: "#000000", opacity: 0 }, s);
        to(flash, { opacity: 1, duration: D * 0.4, ease: ez("power2.in") }, s); to(flash, { opacity: 0, duration: D * 0.6, ease: ez("power2.out") }, s + D * 0.4); tl.set(flash, { backgroundColor: "#ffffff" }, E); break;
      case "spotlight": { const spot = L.spot; if (!spot) break;
        // 중심(ax, ay) 둘레만 밝고 바깥은 어둡게 (글자는 흐리지 않음)
        const R0 = 300, dark = Math.min(0.88, 0.7 * k);
        tl.set(spot, { background: `radial-gradient(circle at ${ax}px ${ay}px, rgba(0,0,0,0) ${R0}px, rgba(0,0,0,${r2(dark)}) ${R0 + 160}px)`, opacity: 0 }, s);
        to(spot, { opacity: 1, duration: Math.min(0.4, D / 3), ease: "power2.out" }, s);
        to(spot, { opacity: 0, duration: Math.min(0.35, D / 3), ease: "power2.in" }, E - Math.min(0.35, D / 3));
        break; }
      case "bw": if (!filt) break; tl.set(filt, { filter: "blur(0px) grayscale(1)" }, s); tl.set(filt, { filter: "blur(0px) grayscale(0)" }, E); break;
    }
  }

  // ── 자막 · 훅 모션: el = .sf-m (모션 전용 감싸개), 시작 s, 길이 D ──
  function applyMotion(tl, el, m, s0, D, speed, delay) {
    if (!el || !m || m === "none") return;
    // 속도(빠르게 0.6배 · 보통 · 느리게 1.6배, 또는 숫자 배수) · 지연(초)
    const k = typeof speed === "number" ? speed : SPEED_K[speed] || 1;
    const s = s0 + (Number(delay) || 0);
    const T = (x) => r2(x * k);
    const all = (sel) => Array.from(el.querySelectorAll(sel));
    const span = Math.min(0.7 * k, D * 0.6);
    const ft = (t, a, b, at) => tl.fromTo(t, a, b, at);
    if (m === "pop") ft(el, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: T(0.18), ease: "back.out(2.2)" }, s);
    else if (m === "rise") ft(el, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: T(0.28), ease: "power3.out" }, s);
    else if (m === "slide") ft(el, { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: T(0.3), ease: "power3.out" }, s);
    else if (m === "zoomSettle") ft(el, { scale: 1.7, opacity: 0 }, { scale: 1, opacity: 1, duration: T(0.3), ease: "power3.out" }, s);
    else if (m === "flip") ft(el, { rotationX: 90, opacity: 0, transformPerspective: 600 }, { rotationX: 0, opacity: 1, duration: T(0.35), ease: "back.out(1.6)" }, s);
    else if (m === "blur") ft(el, { filter: "blur(14px)", opacity: 0, scale: 1.04 }, { filter: "blur(0px)", opacity: 1, scale: 1, duration: T(0.35), ease: "power2.out" }, s);
    else if (m === "bounce") {
      ft(el, { y: -110 }, { y: 0, duration: T(0.55), ease: "bounce.out" }, s);
      ft(el, { opacity: 0 }, { opacity: 1, duration: T(0.08) }, s);
    } else if (m === "slam") {
      ft(el, { scale: 2.2, opacity: 0 }, { scale: 1, opacity: 1, duration: T(0.2), ease: "power4.in" }, s);
      ft(el, { y: 0 }, { keyframes: [{ y: 10, duration: T(0.04) }, { y: -6, duration: T(0.05) }, { y: 3, duration: T(0.05) }, { y: 0, duration: T(0.05) }] }, s + T(0.2));
    } else if (m === "shakeIn") {
      ft(el, { opacity: 0 }, { opacity: 1, duration: T(0.06) }, s);
      // 좌우로만 흔들림 (기울이면 두 줄 자막의 줄끼리 닿을 수 있어 회전은 뺌)
      ft(el, { x: 0 }, { keyframes: [{ x: -18, duration: T(0.045) }, { x: 16, duration: T(0.045) }, { x: -10, duration: T(0.045) }, { x: 8, duration: T(0.045) }, { x: -4, duration: T(0.045) }, { x: 0, duration: T(0.045) }] }, s);
    } else if (m === "typing") {
      const cs = all(".sf-c");
      const step = Math.min(T(0.06), span / Math.max(1, cs.length));
      // 아직 안 나온 글자는 자리도 차지하지 않게(display:none) → 상자가 나온 글자만큼만 늘어남
      const shown = new Set();
      cs.forEach((c, i) => {
        // 줄 상자도 그 줄 첫 글자가 나올 때 같이 나타남 (빈 상자가 미리 보이지 않게)
        const ln = c.closest(".sf-ln");
        if (ln && !shown.has(ln)) { shown.add(ln); tl.set(ln, { display: "inline-block" }, s + i * step); }
        tl.set(c, { display: "inline-block" }, s + i * step); ft(c, { opacity: 0 }, { opacity: 1, duration: T(0.01) }, s + i * step);
      });
    } else if (m === "words") {
      const ws = all(".sf-w");
      const step = Math.min(T(0.14), span / Math.max(1, ws.length));
      const shown = new Set();
      ws.forEach((w, i) => {
        const ln = w.closest(".sf-ln");
        if (ln && !shown.has(ln)) { shown.add(ln); tl.set(ln, { display: "inline-block" }, s + i * step); }
        tl.set(w, { display: "inline-block" }, s + i * step);
        ft(w, { opacity: 0, y: 24, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: T(0.16), ease: "back.out(2)" }, s + i * step);
      });
    } else if (m === "emphasis") {
      const ems = all("em");
      if (!ems.length) return applyMotion(tl, el, "pop", s, D, k, 0);
      // 글자 크기 배수(--emk)를 키워 자리 자체가 넓어지게: 옆 낱말은 밀리고 상자도 같이 커져 겹치지 않음
      ems.forEach((em) => {
        ft(em, { "--emk": 1 }, { "--emk": 1.3, duration: T(0.12), ease: "power2.out" }, s + T(0.12));
        tl.to(em, { "--emk": 1.15, duration: T(0.16), ease: "power2.inOut" }, s + T(0.24));
      });
    } else if (m === "marker") {
      all(".sf-mk").forEach((mk, i) => ft(mk, { scaleX: 0 }, { scaleX: 1, duration: T(0.35), ease: "power2.out" }, s + T(0.1) + i * T(0.12)));
    } else if (m === "jelly") {
      // 글자마다 위로 말랑하게 늘었다(폭은 줄어듦) 눌렸다 제자리 — 옆 글자와 겹치지 않게 가로는 1배 이하
      const cs = all(".sf-c");
      const step = Math.min(T(0.05), span / Math.max(1, cs.length));
      cs.forEach((c, i) => {
        tl.set(c, { transformOrigin: "50% 100%" }, s);
        ft(c, { scaleX: 0.88, scaleY: 1.14, opacity: 0 }, { keyframes: [{ scaleX: 0.88, scaleY: 1.14, opacity: 1, duration: T(0.08) }, { scaleX: 1, scaleY: 0.9, duration: T(0.1) }, { scaleX: 1, scaleY: 1.04, duration: T(0.08) }, { scaleX: 1, scaleY: 1, duration: T(0.08) }] }, s + i * step);
      });
    } else if (m === "bounceRhythm") {
      // 글자가 하나씩 내려앉아 통통 (상자가 있으면 상자 안에서만 작게)
      const cs = all(".sf-c");
      const boxed = hasBox(el.querySelector(".sf-ln"));
      // 낙차는 줄 사이 · 상자 여백 안에서만 (윗줄 · 상자 밖으로 안 나감), 대신 바닥에서 눌렸다 펴지는 통통함
      const amp = boxed ? 8 : 12;
      const step = Math.min(T(0.05), span / Math.max(1, cs.length));
      cs.forEach((c, i) => {
        tl.set(c, { transformOrigin: "50% 100%" }, s);
        ft(c, { y: -amp, scaleY: 0.45, opacity: 0 }, { y: 0, scaleY: 1, opacity: 1, duration: T(0.45), ease: "bounce.out" }, s + i * step);
      });
    } else if (m === "colorIn") {
      // 회색에서 각 낱말 제 색으로 (그라데이션 글자는 투명이라 건너뜀)
      const ws = all(".sf-w");
      const step = Math.min(T(0.12), span / Math.max(1, ws.length));
      ws.forEach((w, i) => {
        const col = typeof getComputedStyle === "function" ? getComputedStyle(w).color : "";
        if (!col || col === "rgba(0, 0, 0, 0)") return;
        ft(w, { color: "#8a8a8a" }, { color: col, duration: T(0.22), ease: "power1.out" }, s + T(0.15) + i * step);
      });
    } else if (m === "weightWave") {
      // 글자마다 굵기가 물결처럼 (가변 굵기 글꼴에서 보임, 폭이 자리 따라 늘어 겹치지 않음)
      const cs = all(".sf-c");
      const w0 = typeof getComputedStyle === "function" && cs[0] ? +getComputedStyle(cs[0]).fontWeight || 800 : 800;
      const lo = Math.max(200, w0 - 500);
      const step = Math.min(T(0.04), span / Math.max(1, cs.length));
      cs.forEach((c, i) => ft(c, { fontWeight: lo }, { keyframes: [{ fontWeight: 900, duration: T(0.14), ease: "power1.out" }, { fontWeight: w0, duration: T(0.18), ease: "power1.inOut" }] }, s + i * step));
    } else if (m === "widthWave") {
      // 자간이 넓게 퍼져 있다가 가운데로 모이며 나타남 (자리 자체가 줄어 겹치지 않음)
      const ls = typeof getComputedStyle === "function" ? getComputedStyle(el.closest(".sf-cap, .sf-hook") || el).letterSpacing : "normal";
      ft(el, { letterSpacing: "0.12em", opacity: 0 }, { letterSpacing: ls === "normal" ? "0em" : ls, opacity: 1, duration: T(0.5), ease: "power3.out" }, s);
    } else if (m === "flicker") {
      // 낱말마다 형광등처럼 정해진 순서로 깜빡
      const ws = all(".sf-w");
      const pat = [[0, 1, 0.15, 1, 0, 1], [0, 0.4, 1, 0.2, 1], [0, 1, 0, 0.7, 1], [0, 0.2, 0.9, 0, 1]];
      ws.forEach((w, i) => {
        const p = pat[i % pat.length];
        ft(w, { opacity: 0 }, { keyframes: p.slice(1).map((o2) => ({ opacity: o2, duration: T(0.05), ease: "none" })) }, s + i * T(0.07));
      });
    } else if (m === "boxUnfold") {
      // 줄 상자가 가운데서 옆으로 펼쳐지고, 글자가 상자 안에서 살짝 올라옴
      all(".sf-ln").forEach((ln, i) => ft(ln, { clipPath: "inset(0% 50% 0% 50%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: T(0.3), ease: "power3.out" }, s + i * T(0.1)));
      all(".sf-w").forEach((w, i) => ft(w, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: T(0.22), ease: "power2.out" }, s + T(0.18) + i * T(0.03)));
    } else if (m === "landSquash") {
      // 위에서 떨어져 한 번 눌렸다 튐 (바닥 기준)
      tl.set(el, { transformOrigin: "50% 100%" }, s);
      ft(el, { y: -140, opacity: 0, scaleX: 1, scaleY: 1 }, { keyframes: [{ y: 0, opacity: 1, duration: T(0.22), ease: "power2.in" }, { scaleX: 1.08, scaleY: 0.86, duration: T(0.07) }, { scaleX: 0.97, scaleY: 1.06, duration: T(0.09) }, { scaleX: 1, scaleY: 1, duration: T(0.08) }] }, s);
    } else if (m === "cardFlip") {
      all(".sf-ln").forEach((ln, i) => ft(ln, { rotationX: -90, opacity: 0, transformPerspective: 1200, transformOrigin: "50% 50%" }, { rotationX: 0, opacity: 1, duration: T(0.4), ease: "back.out(1.2)" }, s + i * T(0.14)));
    } else if (m === "lineRise") {
      // 줄마다 아래에서 올라오며 보이지 않는 틀에서 드러남 (상자와 글자가 같이 움직여 상자 밖으로 안 나감)
      all(".sf-ln").forEach((ln, i) => ft(ln, { y: 36, opacity: 0, clipPath: "inset(0% 0% 100% 0%)" }, { y: 0, opacity: 1, clipPath: "inset(0% 0% 0% 0%)", duration: T(0.4), ease: "power3.out" }, s + i * T(0.13)));
    } else if (m === "dropDown") {
      // 아랫줄부터 차례로 내려와 쌓임 (내려오는 줄이 이미 보이는 줄을 지나가지 않게)
      const lns = all(".sf-ln");
      lns.forEach((ln, i) => ft(ln, { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: T(0.36), ease: "back.out(1.8)" }, s + (lns.length - 1 - i) * T(0.12)));
    } else if (m === "numberRoll") {
      // 숫자가 0부터 올라가 원래 숫자에서 멈춤 (자릿수는 0으로 채워 폭이 흔들리지 않게)
      const ns = all(".sf-num");
      if (!ns.length) return applyMotion(tl, el, "pop", s, D, k, 0);
      ft(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: T(0.2), ease: "power2.out" }, s);
      ns.forEach((n) => {
        const raw = n.dataset.n || n.textContent;
        const target = parseInt(raw.replace(/,/g, ""), 10) || 0;
        const digits = raw.replace(/,/g, "").length;
        const fmt2 = (x) => { const t = String(Math.round(x)).padStart(digits, "0"); return raw.includes(",") ? Number(t).toLocaleString("en-US").padStart(raw.length, "0") : t; };
        const o2 = { v: 0 };
        tl.fromTo(o2, { v: 0 }, { v: target, duration: T(0.9), ease: "power3.out", onUpdate: () => { n.textContent = fmt2(o2.v); }, onComplete: () => { n.textContent = raw; } }, s + T(0.05));
      });
    } else if (m === "swap") {
      // 강조 칸 안의 낱말이 차례로: 앞 낱말이 위로 빠진 뒤 다음 낱말이 아래에서 올라옴 (같이 보이는 때 없음)
      const box = el.querySelector(".sf-swapbox");
      if (!box) return applyMotion(tl, el, "pop", s, D, k, 0);
      ft(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: T(0.2), ease: "power2.out" }, s);
      const alts = Array.from(box.children);
      const seg = Math.min(T(0.75), Math.max(0.3, (D - 0.4) / alts.length));
      // 처음엔 첫 낱말만 보임(CSS). 앞 낱말이 위로 빠진 뒤 다음 낱말이 올라옴 — 같이 보이는 때 없음, 상자 여백 안에서만 움직임
      alts.forEach((a, i) => {
        if (i === 0) return;
        const t0 = s + i * seg;
        tl.fromTo(alts[i - 1], { y: 0, opacity: 1 }, { y: "-0.22em", opacity: 0, duration: T(0.12), ease: "power2.in", immediateRender: false }, t0);
        ft(a, { y: "0.22em", opacity: 0 }, { y: 0, opacity: 1, duration: T(0.14), ease: "power2.out" }, t0 + T(0.13));
      });
    } else if (m === "wipe") {
      // 보이지 않는 걸레가 왼→오른쪽 (가장자리만 부드러운 가림, 글자 번짐 없음)
      all(".sf-ln").forEach((ln, i) => ft(ln, { "--wp": 0 }, { "--wp": 112, duration: T(0.6), ease: "power2.inOut" }, s + i * T(0.18)));
    } else if (m === "stopMotion") {
      // 종이 조각처럼 한 장씩 탁: 정해진 각도로 살짝 삐뚤게 놓임 (무작위 없음)
      const ANG = [-2, 1.5, -1, 2, -1.5, 1, -2.5, 1.8];
      const ws = all(".sf-w");
      const step = Math.min(T(0.16), span / Math.max(1, ws.length));
      const shown = new Set();
      ws.forEach((w, i) => {
        const t0 = s + i * step;
        const ln = w.closest(".sf-ln");
        if (ln && !shown.has(ln)) { shown.add(ln); tl.set(ln, { display: "inline-block" }, t0); }
        tl.set(w, { display: "inline-block", rotation: ANG[i % ANG.length], scale: 1.04 }, t0);
        tl.set(w, { scale: 1 }, t0 + T(0.07));
      });
    } else if (m === "outlineFill") {
      // 빈 테두리 글자가 먼저 보이고, 낱말마다 아래부터 색이 차오름
      ft(el, { opacity: 0 }, { opacity: 1, duration: T(0.15) }, s);
      all(".sf-kf").forEach((f, i) => ft(f, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: T(0.42), ease: "power2.inOut" }, s + T(0.3) + i * T(0.1)));
    } else if (m === "searchBar") {
      // 검색창이 톡 → 글자가 한 자씩 → 돋보기 버튼 눌림
      const bar = el.querySelector(".sf-search");
      if (!bar) return;
      ft(bar, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: T(0.22), ease: "back.out(2)" }, s);
      const cs = all(".sf-c");
      const room = Math.max(0.4, Math.min(D * 0.55, 1.6 * k));
      const step = room / Math.max(1, cs.length);
      cs.forEach((c, i) => { tl.set(c, { display: "inline-block" }, s + T(0.25) + i * step); ft(c, { opacity: 0 }, { opacity: 1, duration: 0.01 }, s + T(0.25) + i * step); });
      const btn = el.querySelector(".sf-sbtn");
      if (btn) tl.to(btn, { scale: 0.86, duration: T(0.07), yoyo: true, repeat: 1, backgroundColor: "#e9ed12", color: "#000000" }, s + T(0.35) + room);
    } else if (m === "chatStack") {
      // 질문 말풍선이 줄마다 아래에서 톡 올라와 쌓임
      all(".sf-ln").forEach((ln, i) => ft(ln, { y: 30, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: T(0.28), ease: "back.out(2)" }, s + i * T(0.5)));
    } else if (m === "stompWords") {
      // 낱말마다 화면 가득 한 장씩 → 마지막에 전체 문장
      const hookEl = el.parentElement;
      const sw = hookEl ? Array.from(hookEl.querySelectorAll(".sf-stw")) : [];
      const beat = Math.min(T(0.38), Math.max(0.18, (D * 0.7) / Math.max(1, sw.length)));
      sw.forEach((w, i) => {
        tl.set(w, { xPercent: -50, yPercent: -50 }, s);
        ft(w, { opacity: 1, scale: 1.22 }, { opacity: 1, scale: 1, duration: Math.min(0.12, beat * 0.4), ease: "power3.out" }, s + i * beat);
        tl.set(w, { opacity: 0 }, s + (i + 1) * beat);
      });
      ft(el, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: T(0.22), ease: "back.out(2)" }, s + sw.length * beat);
    } else if (m === "karaoke") {
      // 낱말 길이에 비례해 차례로 색이 채워짐 (말하는 속도에 맞춤)
      const ws = all(".sf-w");
      const lens = ws.map((w) => Math.max(1, [...(w.firstChild && w.firstChild.textContent ? w.firstChild.textContent : w.textContent)].length));
      const total = lens.reduce((a, b) => a + b, 0) || 1;
      const room = Math.max(0.2, D - 0.1);
      let t = s;
      ws.forEach((w, i) => {
        const f = w.querySelector(".sf-kf");
        const dur = room * (lens[i] / total);
        if (f) ft(f, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: dur, ease: "none" }, t);
        t += dur;
      });
    }
  }

  // ── 색면 와이프 · 빛 띠: 시간 없는 띠 요소를 화면 밖 → 안 → 밖으로 (set + to) ──
  function transFx(tl, q, o, tin, tout) {
    const W = q("#" + CSS_ID(o.id) + "_tw"), Lk = q("#" + CSS_ID(o.id) + "_tl");
    if (W) {
      tl.set(W, { x: -1300 }, 0);
      if (tin === "colorWipe") { tl.set(W, { x: -1300 }, Math.max(0, o.start - 0.24)); tl.to(W, { x: 0, duration: 0.22, ease: "power2.in" }, Math.max(0, o.start - 0.22)); tl.to(W, { x: 1300, duration: 0.26, ease: "power2.out" }, o.start + 0.02); }
      if (tout === "colorWipe") { tl.set(W, { x: -1300 }, Math.max(o.start + 0.3, o.end - 0.26)); tl.to(W, { x: 0, duration: 0.22, ease: "power2.in" }, Math.max(o.start + 0.3, o.end - 0.24)); tl.to(W, { x: 1300, duration: 0.26, ease: "power2.out" }, o.end); }
    }
    if (Lk) {
      tl.set(Lk, { x: -1300, skewX: -16 }, 0);
      if (tin === "lightLeak") { tl.set(Lk, { x: -1300 }, Math.max(0, o.start - 0.26)); tl.to(Lk, { x: 1300, duration: 0.6, ease: "power1.inOut" }, Math.max(0, o.start - 0.25)); }
      if (tout === "lightLeak") { tl.set(Lk, { x: -1300 }, Math.max(o.start + 0.3, o.end - 0.32)); tl.to(Lk, { x: 1300, duration: 0.6, ease: "power1.inOut" }, Math.max(o.start + 0.3, o.end - 0.3)); }
    }
  }
  // ── 그림판 요소: 선 그어 짚기 · 막대 · 게이지 (패널이 열린 뒤 차례로) ──
  function panelExtras(tl, q, pn, s) {
    const P = "#" + CSS_ID(pn.id);
    const dots = Array.from((q(P) || { querySelectorAll: () => [] }).querySelectorAll(".sf-cl-dot"));
    dots.forEach((dot, i) => {
      const t0 = s + 0.7 + i * 0.6;
      const line = q(`${P} .sf-cl-line[data-i="${i}"]`), lab = q(`${P} .sf-cl-lab[data-i="${i}"]`);
      tl.fromTo(dot, { attr: { r: 0 } }, { attr: { r: 14 }, duration: 0.2, ease: "back.out(3)" }, t0);
      if (line) tl.fromTo(line, { attr: { "stroke-dashoffset": 100 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.3, ease: "power2.out" }, t0 + 0.15);
      if (lab) tl.fromTo(lab, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(2)" }, t0 + 0.42);
    });
    const host = q(P);
    if (!host) return;
    // 숫자: 0부터 원래 값까지 (소수 자리 유지)
    const count = (el2, t0, dur) => {
      const raw = el2.dataset.v || el2.textContent;
      const target = parseFloat(raw) || 0;
      const dec = (String(raw).split(".")[1] || "").length;
      const o2 = { v: 0 };
      tl.fromTo(o2, { v: 0 }, { v: target, duration: dur, ease: "power2.out", onUpdate: () => { el2.textContent = o2.v.toFixed(dec); }, onComplete: () => { el2.textContent = raw; } }, t0);
    };
    Array.from(host.querySelectorAll(".sf-bar")).forEach((b, i) => {
      tl.fromTo(b, { scaleY: 0 }, { scaleY: 1, duration: 0.6, ease: "power3.out" }, s + 0.6 + i * 0.15);
      const cv = b.parentElement.querySelector(".sf-cv");
      if (cv) count(cv, s + 0.6 + i * 0.15, 0.6);
    });
    Array.from(host.querySelectorAll(".sf-gf")).forEach((g, i) => {
      tl.fromTo(g, { scaleX: 0 }, { scaleX: +g.dataset.k || 0, duration: 0.8, ease: "power2.out" }, s + 0.6 + i * 0.2);
      const cv = g.closest(".sf-gr").querySelector(".sf-cv");
      if (cv) count(cv, s + 0.6 + i * 0.2, 0.8);
    });
  }

  // 줄에 상자(배경 · 테이프 · 타원 선)가 있는지 (있으면 글자가 상자 밖으로 나가지 않게 줄째로 움직임)
  function hasBox(ln) {
    if (!ln || typeof getComputedStyle !== "function") return false;
    const cs = getComputedStyle(ln);
    return cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.boxShadow !== "none" || getComputedStyle(ln, "::before").content !== "none";
  }
  // ── 나갈 때 (자막 · 훅): 끝나기 직전에 ──
  function applyExit(tl, el, x, end, speed) {
    if (!el || !x || x === "none") return;
    const k = typeof speed === "number" ? speed : SPEED_K[speed] || 1;
    const d = r2(0.24 * k);
    const t = Math.max(0, end - d - 0.04);
    if (x === "fade") tl.to(el, { opacity: 0, duration: d, ease: "power1.in" }, t);
    else if (x === "up") tl.to(el, { y: -50, opacity: 0, duration: d, ease: "power2.in" }, t);
    else if (x === "scatter") {
      // 정해진 방향으로 흩어짐: 상자가 있으면 줄 조각, 없으면 낱말 조각 (윗줄은 위로 · 아랫줄은 아래로 · 옆은 바깥으로)
      const boxed = hasBox(el.querySelector(".sf-ln"));
      const lines = Array.from(el.querySelectorAll(".sf-ln"));
      const parts = boxed ? lines : Array.from(el.querySelectorAll(".sf-w"));
      const n = parts.length;
      parts.forEach((p, i) => {
        const li = boxed ? i : Math.max(0, lines.indexOf(p.closest(".sf-ln")));
        const dy = lines.length > 1 ? (li === 0 ? -40 : 40) : (i % 2 ? 30 : -30);
        const dx = boxed ? (i % 2 ? 30 : -30) : r2((i - (n - 1) / 2) * 44);
        tl.to(p, { x: dx, y: dy, rotation: i % 2 ? 7 : -7, opacity: 0, duration: r2(d * 1.2), ease: "power2.in" }, t - 0.05);
      });
    }
  }
  // ── 강조 장식 (동그라미 · 방점 · 꺾쇠 · 도장): 모션과 상관없이 등장 직후 한 번 ──
  function emDecor(tl, el, mode, s, speed, emColor) {
    if (!el) return;
    const k = typeof speed === "number" ? speed : SPEED_K[speed] || 1;
    const ems = Array.from(el.querySelectorAll("em"));
    if (!ems.length) return;
    if (mode === "circle") ems.forEach((em, i) => { const p = em.querySelector(".sf-circ path"); if (p) tl.fromTo(p, { attr: { "stroke-dasharray": 100, "stroke-dashoffset": 100 } }, { attr: { "stroke-dashoffset": 0 }, duration: r2(0.5 * k), ease: "power2.inOut" }, s + 0.3 * k + i * 0.2); });
    else if (mode === "dots") {
      let j = 0;
      ems.forEach((em) => em.querySelectorAll(".sf-w").forEach((w) => { tl.set(w, { "--dc": emColor || "#e9ed12" }, s + 0.3 * k + j * 0.12 * k); j++; }));
    } else if (mode === "brackets") ems.forEach((em) => {
      const D2 = [[-18, -14], [18, -14], [-18, 14], [18, 14]];
      Array.from(em.querySelectorAll(".sf-brk")).forEach((b, i) => tl.fromTo(b, { x: D2[i][0], y: D2[i][1], opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: r2(0.24 * k), ease: "back.out(2.4)" }, s + 0.25 * k));
    });
    else if (mode === "stamp") ems.forEach((em, i) => tl.fromTo(em, { scale: 0.6, opacity: 0 }, { keyframes: [{ scale: 1.06, opacity: 1, duration: r2(0.12 * k), ease: "power3.in" }, { scale: 1, duration: r2(0.1 * k), ease: "power2.out" }] }, s + 0.22 * k + i * 0.15));
  }

  // ── GSAP 타임라인 (빌드와 편집기 미리보기가 같은 함수 사용) ──
  function buildTimeline(gsap, tl, data, root) {
    const d = defaults(data);
    const q = (sel) => (root || document).querySelector(sel);
    const qa = (sel) => Array.from((root || document).querySelectorAll(sel));

    // 카메라 키프레임 (#sf-cam): 키프레임 사이를 부드럽게 잇는다
    const cam = q("#sf-cam");
    const kfs = [...d.camera].sort((a, b) => a.t - b.t);
    if (cam) {
      tl.set(cam, Object.assign({ transformOrigin: "0 0" }, kfs.length ? camXY(kfs[0]) : { x: 0, y: 0, scale: 1 }), 0);
      for (let i = 0; i + 1 < kfs.length; i++) {
        const a = kfs[i], b = kfs[i + 1];
        if (i === 0 && a.t > 0) tl.set(cam, camXY(a), a.t);
        tl.to(cam, Object.assign({ duration: Math.max(0.01, b.t - a.t), ease: b.ease || "power1.inOut" }, camXY(b)), a.t);
      }
    }

    // 효과 (#sf-fx: 줌 · 이동, #sf-shake: 흔들림 · 기울기, #sf-filt: 흐림 · 흑백, #sf-flash: 번쩍 · 암전)
    // 겹치는 층은 set + to 만 써서(fromTo 금지) 앞뒤로 탐색해도 값이 꼬이지 않게 한다
    const L = { fx: q("#sf-fx"), sh: q("#sf-shake"), filt: q("#sf-filt"), flash: q("#sf-flash"), spot: q("#sf-spot") };
    if (L.spot) tl.set(L.spot, { opacity: 0 }, 0);
    if (L.fx) tl.set(L.fx, { transformOrigin: "0 0", x: 0, y: 0, scale: 1 }, 0);
    if (L.sh) tl.set(L.sh, { x: 0, y: 0, rotation: 0 }, 0);
    if (L.filt) tl.set(L.filt, { filter: "blur(0px) grayscale(0)" }, 0);
    if (L.flash) tl.set(L.flash, { opacity: 0, backgroundColor: "#ffffff" }, 0);
    const fxList = [...d.effects];
    // 훅의 줌 효과: 훅 시작~끝 동안 같은 효과 엔진으로
    const hk = pickedHook(d);
    if (hk && hk.zoom) {
      const z = typeof hk.zoom === "string" ? { type: hk.zoom } : hk.zoom;
      if (z && EFFECTS[z.type]) fxList.push(Object.assign({ strength: 1, ax: 540, ay: 800 }, z, { start: hk.start || 0, end: Math.max((hk.start || 0) + 0.2, hk.end || 3), id: "hookzoom" }));
    }
    for (const e of fxList.sort((a, b) => a.start - b.start)) applyEffect(tl, e, L);

    // 아이콘
    for (const o of d.overlays) {
      const el = q("#" + CSS_ID(o.id));
      if (!el) continue;
      if (o.kind === "chat") {
        if (VIS_LAYOUTS[o.layout]) { faceFor(tl, q, o, o.layout, o.start, o.end); visEnter(tl, el, o.layout, o.start, o.end, o.enter || "auto"); chatAnim(tl, el, o, o.start + 0.25); continue; }
        const box = el.querySelector(".sf-chat2");
        if (box && o.enter !== "none") tl.fromTo(box, { scale: 0.92, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: "back.out(1.6)" }, o.start);
        chatAnim(tl, el, o, o.start);
        if (box && o.exit === "pop") tl.to(box, { scale: 0.9, opacity: 0, duration: 0.15, ease: "power2.in" }, Math.max(o.start, o.end - 0.15));
        continue;
      }
      if (o.kind === "insert") {
        // 장면 컷 전환: cut(바로) · fade · zoom(살짝 확대) · colorWipe · lightLeak
        const tin = o.enter || "cut", tout = o.exit || "cut";
        transFx(tl, q, o, tin, tout);
        if (VIS_LAYOUTS[o.layout] && o.layout !== "full") faceFor(tl, q, o, o.layout, o.start, o.end);
        if (tin === "lightLeak") tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, o.start);
        if (tout === "lightLeak") tl.to(el, { opacity: 0, duration: 0.3, ease: "power1.in" }, Math.max(o.start, o.end - 0.3));
        if (tin === "fade") tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power1.out" }, o.start);
        else if (tin === "zoom") tl.fromTo(el, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.35, ease: "power2.out" }, o.start);
        if (tout === "fade") tl.to(el, { opacity: 0, duration: 0.25, ease: "power1.in" }, Math.max(o.start, o.end - 0.25));
        else if (tout === "zoom") tl.to(el, { opacity: 0, scale: 1.08, duration: 0.3, ease: "power2.in" }, Math.max(o.start, o.end - 0.3));
        continue;
      }
      const target = isCentered(o.kind) ? el.firstElementChild : el.querySelector(".sf-tile");
      if (o.kind === "sticker") {
        // 계속 움직임 (정해진 반복, 무작위 없음)
        const img = el.querySelector(".sf-stk-i");
        const dur = Math.max(0.3, o.end - o.start);
        const idle = o.idle || "float";
        const loop = (from, to, half) => tl.fromTo(img, from, Object.assign({ duration: half, ease: "sine.inOut", yoyo: true, repeat: Math.max(1, Math.floor(dur / half) - 1) }, to), o.start);
        if (img && idle === "float") loop({ y: 0 }, { y: -22 }, 0.9);
        else if (img && idle === "wiggle") loop({ rotation: -7 }, { rotation: 7 }, 0.42);
        else if (img && idle === "pulse") loop({ scale: 1 }, { scale: 1.09 }, 0.5);
        else if (img && idle === "hop") loop({ y: 0 }, { y: -34 }, 0.22);
      }
      if (o.kind === "app" && target) tl.set(target, { rotation: o.rot ?? -8 }, 0);
      if (o.kind === "card") {
        // 빨간 동그라미가 그려지듯 나타남
        const ell = el.querySelector(".sf-ring ellipse");
        if (ell) tl.fromTo(ell, { attr: { "stroke-dashoffset": 100 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.45, ease: "power2.out" }, o.ringAt ?? o.start + 0.5);
      }
      if (o.enter !== "none" && target) {
        if (o.enter === "rise") tl.fromTo(target, { y: 520, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: "power3.out" }, o.start);
        else if (o.enter === "slam") tl.fromTo(target, { scale: 1.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "power3.out" }, o.start);
        else if (o.enter === "fade") tl.fromTo(target, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power1.out" }, o.start);
        else tl.fromTo(target, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2.2)" }, o.start);
      }
      if (o.exit === "pop" && target) tl.to(target, { scale: 0.6, opacity: 0, duration: 0.12, ease: "power2.in" }, Math.max(o.start, o.end - 0.12));
      if (o.kind === "quiz") {
        const keys = qa("#" + CSS_ID(o.id) + " .sf-key");
        keys.forEach((k, i) => tl.fromTo(k, { scale: 0.3, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: 0.26, ease: "back.out(2.2)" }, o.start + 0.24 + i * 0.1));
        const pk = keys[o.pick ?? 0];
        if (pk && o.pickAt != null) {
          tl.to(pk, { y: 8, boxShadow: "0 2px 0 #2a2b30, 0 6px 10px rgba(0,0,0,.18)", backgroundColor: "#111214", color: "#ffffff", borderColor: "#111214", duration: 0.12, ease: "power2.out" }, o.start + o.pickAt);
          const b = pk.querySelector("b");
          if (b) tl.to(b, { backgroundColor: "#ff6b1a", color: "#111214", duration: 0.12 }, o.start + o.pickAt);
        }
      }
      if (o.kind === "dm") {
        const T = Object.assign({ follow: 1.8, like: 2.75, type: 3.75, post: 4.55, dm: 5.15 }, o.times || {});
        const at = (r) => o.start + r;
        const W = "#" + CSS_ID(o.id);
        const one = (sel) => q(W + " " + sel);
        const all = (sel) => qa(W + " " + sel);
        const lay = q("#sf-lay");
        if (lay) tl.fromTo(lay, { y: 0 }, { y: o.shift ?? 560, duration: 0.35, ease: "power3.inOut", immediateRender: false }, o.start);
        tl.fromTo(one(".dm-wrap"), { y: -980 }, { y: 0, duration: 0.38, ease: "power3.out" }, o.start);
        tl.fromTo(one(".dm-card"), { y: 260, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, o.start);
        tl.set(all(".dm-btn .on"), { opacity: 0 }, o.start);
        tl.set(all(".dm-typed i"), { opacity: 0 }, o.start);
        tl.set(one(".dm-box"), { height: 0, opacity: 0 }, o.start);
        // 팔로우 · 좋아요 눌림
        const press = (sel, t) => {
          tl.to(one(sel), { scale: 0.86, duration: 0.07, yoyo: true, repeat: 1 }, at(t));
          tl.to(one(sel + " .off"), { opacity: 0, duration: 0.08 }, at(t) + 0.07);
          tl.to(one(sel + " .on"), { opacity: 1, duration: 0.08 }, at(t) + 0.07);
          tl.to(one(sel), { backgroundColor: sel === ".dm-like" ? "#ff3b5c" : "#111214", color: "#ffffff", borderColor: "transparent", duration: 0.1 }, at(t) + 0.07);
        };
        press(".dm-follow", T.follow);
        press(".dm-like", T.like);
        tl.fromTo(one(".dm-like .on"), { scale: 0.5 }, { scale: 1, duration: 0.3, ease: "back.out(4)" }, at(T.like) + 0.07);
        // 댓글 입력 → 게시
        tl.to(one(".dm-ph"), { opacity: 0, duration: 0.06 }, at(T.type));
        const ks = all(".dm-typed i");
        ks.forEach((k, i) => tl.to(k, { opacity: 1, duration: 0.03 }, at(T.type) + 0.05 + i * Math.min(0.09, 0.7 / Math.max(1, ks.length))));
        tl.to(one(".dm-cmt"), { borderColor: "#ff6b1a", duration: 0.1 }, at(T.type));
        tl.to(one(".dm-post"), { color: "#ffffff", backgroundColor: "#0095f6", duration: 0.1 }, at(T.post) - 0.25);
        tl.to(one(".dm-post"), { scale: 0.85, duration: 0.07, yoyo: true, repeat: 1 }, at(T.post));
        // DM 도착: 상자가 열리고 프롬프트가 줄마다 → 천천히 위로 흘러감
        tl.to(one(".dm-box"), { height: o.boxH || 420, opacity: 1, duration: 0.35, ease: "power3.out" }, at(T.dm));
        tl.fromTo(one(".dm-head"), { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "back.out(2)" }, at(T.dm) + 0.1);
        tl.fromTo(one(".dm-msg"), { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.2 }, at(T.dm) + 0.25);
        all(".dm-ln").forEach((l, i) => tl.fromTo(l, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.12 }, at(T.dm) + 0.35 + Math.min(i, 8) * 0.06));
        const scrollFrom = at(T.dm) + 0.9, scrollTo = o.end - 0.1;
        if (scrollTo > scrollFrom) tl.to(one(".dm-scroll"), { y: -(o.scrollPx || 260), duration: scrollTo - scrollFrom, ease: "none" }, scrollFrom);
      }
      if (o.kind === "wflist") {
        const W = "#" + CSS_ID(o.id);
        const one = (sel) => q(W + " " + sel);
        const all = (sel) => qa(W + " " + sel);
        const lay = q("#sf-lay");
        const shift = o.shift ?? 560;
        const close = Math.max(o.start + 0.4, o.end - 0.3);
        if (lay) {
          tl.fromTo(lay, { y: 0 }, { y: shift, duration: 0.35, ease: "power3.inOut", immediateRender: false }, o.start);
          tl.to(lay, { y: 0, duration: 0.3, ease: "power3.inOut" }, close);
        }
        tl.fromTo(one(".ax-wrap"), { y: -980 }, { y: 0, duration: 0.38, ease: "power3.out" }, o.start);
        tl.to(one(".ax-wrap"), { y: -980, duration: 0.3, ease: "power3.in" }, close);
        tl.fromTo(one(".ax-ai"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.2 }, o.start + 0.3);
        tl.fromTo(one(".wf-lab.l1"), { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.2 }, o.start + 0.45);
        tl.fromTo(one(".wf-lab.l2"), { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.2 }, o.start + 1.05);
        all(".wf-card").forEach((c, i) => {
          const t0 = o.start + (i < 3 ? 0.55 + i * 0.13 : 1.15 + (i - 3) * 0.13);
          tl.fromTo(c, { opacity: 0, y: 40, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "back.out(2)" }, t0);
        });
        // 「10분이면 만드는 것부터요」: 위 3개 강조
        const hl = o.start + (o.highlightAt ?? 2.66);
        all(".wf-card.quick").forEach((c, i) => {
          tl.to(c, { borderColor: "#ff6b1a", boxShadow: "0 0 0 5px rgba(255,107,26,.35), 0 14px 26px rgba(0,0,0,.14)", scale: 1.05, duration: 0.18, ease: "power2.out" }, hl + i * 0.08);
          tl.to(c, { scale: 1, duration: 0.2, ease: "power2.inOut" }, hl + 0.2 + i * 0.08);
        });
        all(".wf-card:not(.quick)").forEach((c) => tl.to(c, { opacity: 0.45, duration: 0.2 }, hl));
        all(".wf-badge").forEach((b, i) => tl.fromTo(b, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "back.out(3)" }, hl + i * 0.08));
      }
      if (o.kind === "screen") {
        const v = q("#" + CSS_ID(o.id) + "_v");
        if (v) {
          tl.fromTo(v, { y: 140, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: "power3.out" }, o.start);
          if (o.zoom) tl.to(v, { scale: o.zoom, duration: Math.max(0.5, o.end - o.start - 0.5), ease: "none" }, o.start + 0.4);
        }
      }
      if (o.kind === "aside") {
        // 시각은 모두 이 요소 시작 기준 (초)
        const T = Object.assign({ open: 0, click: 0.55, paste: 0.75, send: 1.85, ai: 2.15, q1: 2.75, picks: [4.55, 5.55, 6.6, 7.5, 8.35] }, o.times || {});
        const at = (r) => o.start + r;
        const W = "#" + CSS_ID(o.id);
        const one = (sel) => q(W + " " + sel);
        const all = (sel) => qa(W + " " + sel);
        const lay = q("#sf-lay");
        const shift = o.shift ?? 500;
        // 위아래 분할: 촬영본을 아래로 내림 → 위 절반은 사이드 창
        if (lay) {
          tl.set(lay, { y: 0 }, 0);
          tl.fromTo(lay, { y: 0 }, { y: shift, duration: 0.35, ease: "power3.inOut" }, at(T.open));
          tl.to(lay, { y: 0, duration: 0.3, ease: "power3.inOut" }, Math.max(at(T.open) + 0.4, o.end - 0.3));
        }
        tl.fromTo(one(".ax-wrap"), { y: -980 }, { y: 0, duration: 0.38, ease: "power3.out" }, at(T.open));
        tl.to(one(".ax-wrap"), { y: -980, duration: 0.3, ease: "power3.in" }, Math.max(at(T.open) + 0.4, o.end - 0.3));
        // 처음 상태
        tl.set(all(".ax-typed .ax-ln"), { opacity: 0 }, o.start);
        tl.set(one(".ax-typed"), { height: 0 }, o.start);
        tl.set([one(".ax-user"), one(".ax-ai"), one(".ax-aimsg")], { opacity: 0 }, o.start);
        tl.set(all(".ax-q"), { opacity: 0, y: 30 }, o.start);
        tl.set(one(".ax-cursor"), { x: 760, y: 840, opacity: 0 }, o.start);
        // 커서가 입력창으로 → 클릭
        tl.to(one(".ax-cursor"), { opacity: 1, duration: 0.15 }, at(T.open) + 0.3);
        tl.to(one(".ax-cursor"), { x: 420, y: 800, duration: 0.3, ease: "power2.inOut" }, at(T.click) - 0.25);
        tl.to(one(".ax-cursor"), { scale: 0.8, duration: 0.07, yoyo: true, repeat: 1, transformOrigin: "10% 10%" }, at(T.click));
        tl.to(one(".ax-input"), { boxShadow: "0 0 0 4px rgba(255,107,26,.55), 0 10px 30px rgba(0,0,0,.12)", duration: 0.12 }, at(T.click));
        // 붙여 넣기: 입력창이 커지며 프롬프트 원문이 줄마다 들어옴
        const lns = all(".ax-typed .ax-ln");
        tl.to(one(".ax-ph"), { opacity: 0, duration: 0.08 }, at(T.paste));
        tl.to(one(".ax-typed"), { height: o.typedH || 560, duration: 0.3, ease: "power2.out" }, at(T.paste));
        const step = Math.min(0.06, (T.send - T.paste - 0.25) / Math.max(1, lns.length));
        lns.forEach((ln, i) => tl.fromTo(ln, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.12, ease: "power1.out" }, at(T.paste) + 0.08 + i * step));
        tl.to(one(".ax-cursor"), { x: 960, y: 900, duration: 0.3, ease: "power2.inOut" }, at(T.send) - 0.35);
        // 보내기 버튼 눌림
        tl.to(one(".ax-send"), { scale: 0.82, duration: 0.07, yoyo: true, repeat: 1 }, at(T.send));
        tl.to(one(".ax-cursor"), { scale: 0.8, duration: 0.07, yoyo: true, repeat: 1, transformOrigin: "10% 10%" }, at(T.send));
        tl.to(one(".ax-typed"), { height: 0, opacity: 0, duration: 0.22, ease: "power2.in" }, at(T.send) + 0.05);
        tl.to(one(".ax-ph"), { opacity: 1, duration: 0.1 }, at(T.send) + 0.25);
        tl.to(one(".ax-input"), { boxShadow: "0 0 0 0px rgba(255,107,26,0), 0 10px 30px rgba(0,0,0,.12)", duration: 0.15 }, at(T.send) + 0.1);
        tl.to(one(".ax-empty"), { opacity: 0, duration: 0.1 }, at(T.paste));
        tl.fromTo(one(".ax-user"), { opacity: 0, y: 160, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: "power3.out", transformOrigin: "100% 100%" }, at(T.send) + 0.08);
        tl.to(one(".ax-cursor"), { opacity: 0, duration: 0.15 }, at(T.send) + 0.25);
        // 어사이드 답: 점 세 개 → 말 → 질문 카드
        tl.to(one(".ax-ai"), { opacity: 1, duration: 0.15 }, at(T.ai));
        all(".ax-typing i").forEach((d, i) => tl.to(d, { y: -8, duration: 0.14, yoyo: true, repeat: 3, ease: "sine.inOut" }, at(T.ai) + i * 0.08));
        tl.to(one(".ax-typing"), { opacity: 0, width: 0, duration: 0.1 }, at(T.q1) - 0.3);
        tl.to(one(".ax-aimsg"), { opacity: 1, duration: 0.2 }, at(T.q1) - 0.25);
        tl.to(one(".ax-user"), { height: o.userH || 150, duration: 0.3, ease: "power2.inOut" }, at(T.q1) - 0.3);
        // 질문 카드마다: 등장 → 보기 톡톡 → 커서가 눌러 고름 → 다음 질문
        const cards = all(".ax-q");
        const qsD = Array.isArray(o.questions) ? o.questions : [];
        let tq = at(T.q1);
        cards.forEach((card, qi) => {
          const picks = (T.picks || []);
          const tp = at(picks[qi] ?? (T.q1 + qi * 1));
          tl.to(card, { opacity: 1, y: 0, duration: 0.24, ease: "power3.out" }, tq);
          const opts = Array.from(card.querySelectorAll(".ax-opt"));
          opts.forEach((op, i) => tl.fromTo(op, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(2.2)" }, tq + 0.08 + i * 0.06));
          const pick = opts[(qsD[qi] && qsD[qi].pick) ?? 0];
          if (pick) {
            tl.set(one(".ax-cursor"), { opacity: 1 }, tp - 0.3);
            tl.to(one(".ax-cursor"), { x: (qsD[qi] && qsD[qi].cx) ?? (pick.dataset.opt % 2 ? 760 : 300), y: (qsD[qi] && qsD[qi].cy) ?? (pick.dataset.opt < 2 ? 600 : 690), duration: 0.25, ease: "power2.inOut" }, tp - 0.28);
            tl.to(one(".ax-cursor"), { scale: 0.8, duration: 0.06, yoyo: true, repeat: 1, transformOrigin: "10% 10%" }, tp);
            tl.to(pick, { y: 6, boxShadow: "0 2px 0 #2a2b30, 0 4px 8px rgba(0,0,0,.18)", backgroundColor: "#111214", color: "#ffffff", borderColor: "#111214", duration: 0.1 }, tp);
            const b = pick.querySelector("b");
            if (b) tl.to(b, { backgroundColor: "#ff6b1a", color: "#111214", duration: 0.1 }, tp);
          }
          if (qi < cards.length - 1) tl.to(card, { opacity: 0, y: -30, duration: 0.18, ease: "power2.in" }, tp + 0.22);
          tq = tp + 0.36;
        });
        tl.to(one(".ax-cursor"), { opacity: 0, duration: 0.2 }, at((T.picks || [])[cards.length - 1] ?? T.q1) + 0.4);
      }
      if (o.kind === "folder-burst") {
        const t0 = o.start + (o.burstAt ?? 1.1);
        const papers = qa("#" + CSS_ID(o.id) + " .sf-paper");
        const s = (o.size || 200) / 200;
        const sheet = el.querySelector(".sf-sheet");
        tl.set(papers, { opacity: 0, scale: 0.6, x: -40 * s, y: 20 * s, rotation: 0 }, o.start);
        if (sheet) tl.set(sheet, { opacity: 1 }, o.start);
        tl.to(target, { keyframes: [{ rotation: -8, duration: 0.06 }, { rotation: 7, duration: 0.07 }, { rotation: -4, duration: 0.06 }, { rotation: 0, duration: 0.08 }] }, t0);
        if (sheet) tl.set(sheet, { opacity: 0 }, t0 + 0.02);
        const dest = [[-300, -40, -38, 1], [260, -70, 32, 1], [40, -190, 14, 0.9]];
        papers.forEach((p, i) =>
          tl.to(p, { opacity: 1, scale: dest[i][3], x: dest[i][0] * s, y: dest[i][1] * s, rotation: dest[i][2], duration: 0.55 + i * 0.03, ease: "power3.out" }, t0 + 0.02 + i * 0.04)
        );
        tl.to(papers, { opacity: 0, y: "+=" + 60 * s, duration: 0.5, ease: "power1.in" }, t0 + 0.75);
      }
    }

    // 기본 편집 틀
    const layEl = q("#sf-lay");
    if (d.layout === "titleBand" && layEl) tl.set(layEl, { y: r2((((d.band || {}).h) || 360) * 0.62) }, 0);
    // 시각 자료(그림판): 레이아웃마다 얼굴 처리 · 등장 · 내용 움직임
    for (const pn of [...(d.panels || [])].sort((a, b) => a.start - b.start)) {
      const el = q("#" + CSS_ID(pn.id));
      if (!el) continue;
      const L = visLayoutOf(pn, d);
      const tin = pn.enter || "auto", tout = pn.exit || tin;
      transFx(tl, q, pn, tin, tout);
      faceFor(tl, q, pn, L, pn.start, pn.end);
      visEnter(tl, el, L, pn.start, pn.end, tin);
      panelExtras(tl, q, pn, pn.start);
      tplAnim(tl, el, pn, pn.start);
    }

    // 자막 모션 (자막마다 caption.motion, 없으면 style.captionMotion)
    for (const c of d.captions) {
      const box = q("#" + CSS_ID(c.id) + " .sf-m");
      const v = capValues(c, d);
      if (box) {
        applyMotion(tl, box, v.motion, c.start, Math.max(0.1, c.end - c.start), v.speed, v.delay);
        emDecor(tl, box, v.emMode, c.start + (Number(v.delay) || 0), v.speed, v.emColor);
        applyExit(tl, box, v.exit, c.end, v.speed);
      }
    }
    // 훅 등장 모션 + 스티커
    const hel = q("#sf-hook");
    if (hel && hk) {
      const hs = hk.start || 0, hd = Math.max(0.2, (hk.end || 3) - hs);
      const hv = headValues(hk, d);
      applyMotion(tl, hel.querySelector(".sf-m"), hv.motion, hs, hd, hv.speed, hv.delay);
      emDecor(tl, hel.querySelector(".sf-m"), hv.emMode, hs + (Number(hv.delay) || 0), hv.speed, hv.emColor);
      applyExit(tl, hel.querySelector(".sf-m"), hv.exit, hs + hd, hv.speed);
      const stk = hel.querySelector(".sf-hook-stk");
      if (stk) tl.fromTo(stk, { scale: 0, rotation: -30, opacity: 0 }, { scale: 1, rotation: 12, opacity: 1, duration: 0.3, ease: "back.out(3)" }, hs + 0.35);
    }
    return tl;
  }

  function CSS_ID(id) {
    return String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  // 편집기 미리보기용: 시각 t 에 보일지
  function visibleAt(start, end, t) {
    return t >= start && t < end;
  }

  const SFX_LIB = {
    // 파일은 tools/editor/sfx/ (ffmpeg 로 직접 합성, 외부 음원 없음) → 컴포지션 sfx/ 로 복사됨
    pop: { label: "팝 (톡 등장)", dur: 0.3 }, click: { label: "딸깍", dur: 0.12 }, "click-soft": { label: "작은 딸깍", dur: 0.12 },
    "whoosh-short": { label: "휙 (짧게)", dur: 0.4 }, whoosh: { label: "휙 (길게)", dur: 0.65 }, typing: { label: "타자", dur: 1.4 },
    "key-press": { label: "키 한 번", dur: 0.18 }, ping: { label: "핑 (질문 · 강조)", dur: 1.1 }, sparkle: { label: "반짝", dur: 1.5 },
    notification: { label: "알림 띵동", dur: 0.7 }, chime: { label: "딩 (성공 · 마무리)", dur: 2.0 }, "impact-bass-1": { label: "쿵 (강조 · 제목)", dur: 1.4 },
  };
  // 효과음 이름 (예전 edit.json 은 name · kind 없이 file 만 있음 → 파일 이름으로)
  function sfxLabel(x) {
    const key = x && (x.name || x.kind);
    if (key && SFX_LIB[key]) return SFX_LIB[key].label;
    const base = String((x && x.file) || key || "효과음").split("/").pop().replace(/\.(mp3|wav|m4a|ogg|aac)$/i, "");
    return SFX_LIB[base] ? SFX_LIB[base].label : base;
  }
  // 강조 후보인지: 효과 · 후기 문장(noEmphasis)은 강조 표시 · 강조 역할 · 줌 · 효과음 제안 · 하이라이트에서 모두 빠짐
  const isEmphasisCandidate = (c) => !!c && !c.noEmphasis;

  g.SFScene = { CHAT_ANIMS, CHAT_COLORS, CHAT_THEMES, chatHTML, VIS_LAYOUTS, PIP_POS, TEMPLATES, TPL_SAMPLE, ROUTE_MODES, visSlot, visLayoutOf, visualHTML, sfxLabel, isEmphasisCandidate, EXITS, TRANS_INFO, applyExit, emDecor, MOTION_GROUPS, CHAR_MOTIONS, LOOK_FX, LOOK_GROUPS, twoTierText, readable, isLight, SFX_LIB, EM_INFO, EFFECT_FIT, LAYOUTS, PANEL_TRANS, SFX_SUGGEST, applyMotion, applyEffect, STYLE_PRESETS, BASE, VALUE_FIELDS, TARGET_KEYS, FONT_OPTIONS, EM_MODES, ROLES, SPEEDS, ALIGNS, valuesCSS, bubbleCSS, chapterCSS, capValues, headValues, ovValues, normalizeStyle, rgba, CAPTION_MOTIONS, INSERT_TRANS, STICKER_IDLE, FONTS, styleCSS, pageCSS, splitRich, pickedHook, hookSize, capSize, capText, capMotion, presetOf, isTextKind, isCentered, rich, EFFECTS, OVERLAY_KINDS, defaults, renderBody, CSS, buildTimeline, visibleAt, camXY, esc };
})(typeof globalThis !== "undefined" ? globalThis : window);
