// 숏폼 편집기 화면 로직 (빌드 없이 바로 도는 브라우저 스크립트)
(() => {
  "use strict";
  const S = window.SFScene;
  const $ = (id) => document.getElementById(id);
  const FPS = 30;

  // ── 상태 ──
  const st = {
    data: null,
    sel: null, // { type: 'caption'|'overlay'|'effect'|'camera'|'feedback', id }
    t: 0,
    playing: false,
    pps: 180, // 타임라인 1초당 픽셀
    undo: [],
    redo: [],
    dirty: false,
    scale: 1,
    version: "",
    viewHook: null, // 「셋 차례로 보기」 중 잠깐 보여 줄 훅 (저장 안 함)
    previewFx: null, // 효과 ▶ 미리보기 (저장 안 함)
    stopAt: null, // 이 시각에 재생 멈춤
    onStop: null,
    media: { videos: [], images: [] },
    stTarget: "cap", stScope: "all", stRole: "emphasis", activeColor: "color", picking: null,
  };
  let tl = null;
  let video = null;
  let saveTimer = null;

  const fmt = (t) => (Math.round(t * 100) / 100).toFixed(2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = (p) => p + Math.random().toString(36).slice(2, 7);
  const r2 = (n) => Math.round(n * 100) / 100;

  function toast(msg, ms = 3200) {
    const el = $("toast");
    el.innerHTML = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), ms);
  }

  // ── 목록 접근 ──
  const LIST = { caption: "captions", overlay: "overlays", effect: "effects", camera: "camera", feedback: "feedback", sfx: "sfx", hook: "hooks", panel: "panels" };
  const items = (type) => st.data[LIST[type]] || (st.data[LIST[type]] = []);
  const find = (sel) => (sel ? items(sel.type).find((x) => x.id === sel.id) : null);

  // ── 되돌리기 ──
  function snapshot() {
    st.undo.push(JSON.stringify(st.data));
    if (st.undo.length > 100) st.undo.shift();
    st.redo = [];
  }
  function undo() {
    if (!st.undo.length) return;
    st.redo.push(JSON.stringify(st.data));
    st.data = JSON.parse(st.undo.pop());
    changed(true);
  }
  function redo() {
    if (!st.redo.length) return;
    st.undo.push(JSON.stringify(st.data));
    st.data = JSON.parse(st.redo.pop());
    changed(true);
  }

  // 데이터가 바뀌면: 무대 · 타임라인 · 패널 다시 그리고 자동 저장 예약
  function changed(full = true) {
    st.dirty = true;
    $("saveState").textContent = "바뀜 (자동 저장 대기)";
    if (find(st.sel) == null) st.sel = null;
    renderStage();
    renderTimeline();
    if (full) renderInspector();
    renderFeedback();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  }

  async function save() {
    clearTimeout(saveTimer);
    const r = await fetch("/api/edit", { method: "PUT", headers: { "Content-Type": "application/json", "X-Base-Version": st.version }, body: JSON.stringify(st.data) });
    if (r.ok) {
      st.dirty = false;
      st.version = (await r.json()).version;
      $("saveState").textContent = "저장됨 " + new Date().toLocaleTimeString("ko-KR");
    } else if (r.status === 409) {
      // 그사이 Claude가 파일을 고침: 내 변경은 버리지 않고 피드백으로 남긴 뒤 새 편집본을 불러온다
      const mine = JSON.stringify(st.data);
      await reloadFromServer("그사이 편집본이 바뀌어서 새로 불러왔어요. 방금 하신 변경은 저장되지 않았어요 — 다시 해 주세요.");
      try { sessionStorage.setItem("sf-lost-edit", mine); } catch (_) {}
    } else $("saveState").textContent = "저장 실패";
  }

  // 서버의 edit.json 을 다시 불러옴 (재생 위치 · 선택 유지)
  async function reloadFromServer(msg) {
    const r = await fetch("/api/edit");
    if (!r.ok) return;
    st.version = r.headers.get("X-Edit-Version") || "";
    const keepSel = st.sel;
    st.data = S.defaults(await r.json());
    st.dirty = false;
    st.sel = keepSel;
    const src = "/comp/" + st.data.source;
    if (video && !video.src.endsWith(st.data.source)) { video.src = src; video.load(); }
    renderStage(); renderTimeline(); renderInspector(); renderFeedback();
    $("saveState").textContent = "불러옴 " + new Date().toLocaleTimeString("ko-KR");
    if (msg) toast(msg, 6000);
  }

  // 2초마다 파일이 바뀌었는지 확인 (Claude가 고치면 편집기에 바로 보임)
  async function watchVersion() {
    try {
      const v = (await fetch("/api/edit/version").then((x) => x.json())).version;
      if (v && st.version && v !== st.version && !st.dirty && !document.activeElement?.matches("input, textarea")) {
        await reloadFromServer("Claude가 고친 편집본을 불러왔어요");
      }
    } catch (_) {}
    setTimeout(watchVersion, 2000);
  }

  // 미리보기에 쓸 데이터 (저장본 + 잠깐 보기 설정)
  function viewData() {
    const d = Object.assign({}, st.data);
    if (st.viewHook) d.hookPick = st.viewHook;
    if (st.previewFx) d.effects = [...(d.effects || []), st.previewFx];
    return d;
  }
  const hookName = (h, i) => h.label || "훅 " + "ABCDEFG"[i];

  // ── 무대(미리보기) ──
  function fitStage() {
    const wrap = $("stageWrap");
    const s = Math.min((wrap.clientWidth - 16) / 1080, (wrap.clientHeight - 16) / 1920);
    st.scale = s;
    const stage = $("stage");
    stage.style.transform = `scale(${s})`;
    stage.style.left = (wrap.clientWidth - 1080 * s) / 2 + "px";
    stage.style.top = (wrap.clientHeight - 1920 * s) / 2 + "px";
  }

  function mountStage() {
    // 처음 한 번: 촬영본 · 카메라 층 + 아이콘/자막 층
    const root = $("sfroot");
    root.innerHTML = `<style>${S.CSS}</style><style id="sfPreset"></style>` + S.renderBody(Object.assign({}, st.data, { captions: [], overlays: [], sfx: [], hooks: [], panels: [], layout: "full", source: "/comp/" + st.data.source })) + `<div id="sfOverlays"></div>`;
    video = root.querySelector("#footage");
    video.preload = "auto";
    video.playsInline = true;
    video.addEventListener("loadedmetadata", () => {
      if (!st.data.duration || Math.abs(st.data.duration - video.duration) > 0.05) {
        st.data.duration = r2(video.duration);
      }
      renderTimeline();
    });
    video.addEventListener("ended", () => setPlaying(false));
  }

  function renderStage() {
    // 아이콘 · 자막만 다시 그림 (촬영본은 그대로 두어 다시 불러오지 않음)
    const vd = viewData();
    const ps = $("sfPreset");
    if (ps) ps.textContent = S.pageCSS(vd, "/comp/", "#sfroot");
    renderStylePanel();
    renderLayout();
    renderHookBar();
    const html = S.renderBody(Object.assign({}, vd, { source: "" }), { base: "/comp/" });
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    (tmp.querySelector("#sf-lay") || tmp.querySelector("#sf-cam"))?.remove();
    const host = $("sfOverlays");
    host.innerHTML = "";
    while (tmp.firstChild) host.appendChild(tmp.firstChild);
    host.querySelectorAll(".sf-ov, .sf-cap, .sf-hook, .sf-panel").forEach((el) => {
      el.addEventListener("pointerdown", onStagePointer);
    });
    if (tl) tl.kill();
    tl = gsap.timeline({ paused: true });
    S.buildTimeline(gsap, tl, vd, $("sfroot"));
    seekVisual(st.t);
  }

  function seekVisual(t) {
    if (tl) tl.seek(t, false);
    $("sfroot").querySelectorAll("#sfOverlays [data-start]").forEach((el) => {
      const s = +el.dataset.start, d = +el.dataset.duration;
      el.style.visibility = S.visibleAt(s, s + d, t) ? "visible" : "hidden";
    });
    // 효과음: 재생 중 시작 시각을 지나면 소리 냄
    $("sfroot").querySelectorAll("#sfOverlays audio.sf-sfx").forEach((a) => {
      const s = +a.dataset.start, d = +a.dataset.duration;
      a.volume = Math.min(1, +a.dataset.volume || 0.35);
      const inside = t >= s && t < s + d;
      if (!inside || !st.playing) { if (!a.paused) a.pause(); return; }
      if (a.paused) { a.currentTime = Math.max(0, t - s); a.play().catch(() => {}); }
    });
    // 화면 녹화 영상: 재생 위치에 맞춰 같이 움직임
    $("sfroot").querySelectorAll("#sfOverlays video.sf-scrv").forEach((v) => {
      const s = +v.dataset.start, d = +v.dataset.duration;
      if (!(t >= s && t < s + d)) { if (!v.paused) v.pause(); return; }
      const want = t - s;
      if (Math.abs(v.currentTime - want) > 0.2) v.currentTime = want;
      if (st.playing && v.paused) v.play().catch(() => {});
      if (!st.playing && !v.paused) v.pause();
    });
    // 장면 컷 영상: from(그 영상의 몇 초부터) + 지난 시간
    $("sfroot").querySelectorAll("#sfOverlays video.sf-ins").forEach((v) => {
      const s = +v.dataset.start, d = +v.dataset.duration;
      if (!(t >= s && t < s + d)) { if (!v.paused) v.pause(); return; }
      const want = (+v.dataset.mediaStart || 0) + (t - s);
      if (Math.abs(v.currentTime - want) > 0.25 || (!st.playing && Math.abs(v.currentTime - want) > 0.02)) v.currentTime = want;
      if (st.playing && v.paused) v.play().catch(() => {});
      if (!st.playing && !v.paused) v.pause();
    });
    syncRef(t);
    $("timeLabel").textContent = `${fmt(t)} / ${fmt(st.data.duration || 0)}`;
    $("playhead").style.left = t * st.pps + "px";
    drawSelection();
  }

  function seek(t) {
    st.t = clamp(t, 0, st.data.duration || 0);
    if (video) video.currentTime = st.t;
    seekVisual(st.t);
  }

  function setPlaying(p) {
    st.playing = p;
    if (!p && st.stopAt != null && !st.onStop) st.stopAt = null;
    $("btnPlay").textContent = p ? "⏸" : "▶";
    if (!video) return;
    if (p) {
      if (st.t >= (st.data.duration || 0) - 0.02) seek(0);
      video.play();
    } else video.pause();
  }

  function loop() {
    if (st.playing && video) {
      st.t = video.currentTime;
      if (st.stopAt != null && st.t >= st.stopAt) {
        const cb = st.onStop;
        st.stopAt = null; st.onStop = null;
        setPlaying(false);
        if (cb) cb();
      }
      seekVisual(st.t);
      // 재생 중 타임라인이 따라가게
      const sc = $("tlScroll");
      const x = st.t * st.pps;
      if (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft) sc.scrollLeft = x - 60;
    }
    requestAnimationFrame(loop);
  }

  // 선택 테두리 · 기준점
  function drawSelection() {
    const box = $("selbox");
    const anc = $("anchor");
    box.classList.add("hidden");
    anc.classList.add("hidden");
    const it = find(st.sel);
    if (!it) return;
    if (st.sel.type === "caption" || st.sel.type === "overlay" || st.sel.type === "hook") {
      const el = st.sel.type === "hook" ? $("sfOverlays").querySelector("#sf-hook") : $("sfOverlays").querySelector("#" + CSS.escape(it.id));
      if (!el || el.style.visibility === "hidden") return;
      const sr = $("stage").getBoundingClientRect();
      const r = el.getBoundingClientRect();
      Object.assign(box.style, {
        left: (r.left - sr.left) / st.scale - 8 + "px",
        top: (r.top - sr.top) / st.scale - 8 + "px",
        width: r.width / st.scale + 16 + "px",
        height: r.height / st.scale + 16 + "px",
      });
      box.classList.remove("hidden");
    }
    if (st.sel.type === "effect" || st.sel.type === "camera") {
      anc.style.left = (it.ax ?? 540) + "px";
      anc.style.top = (it.ay ?? 800) + "px";
      anc.classList.remove("hidden");
    }
  }

  // 무대에서 끌어 옮기기
  function onStagePointer(e) {
    if (st.picking || e.altKey) { const v = $("sfroot").querySelector("#footage"); if (v && onPickClick(e, v, "cover")) return; }
    e.preventDefault();
    const el = e.currentTarget;
    if (el.classList.contains("sf-hook")) return dragHook(e, el);
    if (el.classList.contains("sf-panel")) return select({ type: "panel", id: el.id });
    const type = el.classList.contains("sf-cap") ? "caption" : "overlay";
    select({ type, id: el.id });
    const it = find(st.sel);
    if (!it) return;
    if (it.kind === "aside" || it.kind === "screen" || it.kind === "insert") return;
    const sx = e.clientX, sy = e.clientY, ox = it.x ?? 540, oy = it.y ?? (type === "caption" ? S.capValues(it, st.data).y : 0);
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / st.scale, dy = (ev.clientY - sy) / st.scale;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) snapshot();
      moved = true;
      it.x = Math.round(ox + dx);
      it.y = Math.round(oy + dy);
      // 가로 가운데에 붙기
      if (Math.abs(it.x - 540) < 12) it.x = 540;
      if (type === "caption") { el.style.left = it.x + "px"; el.style.top = it.y + "px"; }
      else if (S.isCentered(it.kind)) { el.style.left = it.x + "px"; el.style.top = it.y + "px"; }
      else { el.style.left = it.x - (it.size || 200) / 2 + "px"; el.style.top = it.y - (it.size || 200) / 2 + "px"; }
      drawSelection();
      renderInspector();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) changed();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // 훅 끌기: 세로 위치(style.y)만
  function dragHook(e, el) {
    const h = st.data.hooks.find((x) => x.id === el.dataset.hook);
    if (!h) return;
    select({ type: "hook", id: h.id });
    const sy = e.clientY, oy = (h.style && h.style.y) ?? 420;
    let moved = false;
    const move = (ev) => {
      const dy = (ev.clientY - sy) / st.scale;
      if (!moved && Math.abs(dy) < 4) return;
      if (!moved) snapshot();
      moved = true;
      h.style = Object.assign({}, h.style, { y: Math.round(oy + dy) });
      el.style.top = h.style.y + "px";
      drawSelection();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) changed();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // 기준점 끌기
  function initAnchorDrag() {
    $("anchor").addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const it = find(st.sel);
      if (!it) return;
      snapshot();
      const sr = $("stage").getBoundingClientRect();
      const move = (ev) => {
        it.ax = Math.round(clamp((ev.clientX - sr.left) / st.scale, 0, 1080));
        it.ay = Math.round(clamp((ev.clientY - sr.top) / st.scale, 0, 1920));
        drawSelection();
        renderInspector();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        changed();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  function select(sel) {
    st.sel = sel;
    renderStylePanel();
    renderInspector();
    renderTimeline();
    renderFeedback();
    drawSelection();
  }

  // ── 타임라인 ──
  // 지금 들어간 모션 요약 (역할마다 · 훅 · 줌/효과) — 누르면 모션 보드가 그 역할로 열림
  function motionLabel(m) {
    if (!m || m === "none") return "없음 (바로 나타남)";
    return S.CAPTION_MOTIONS[m]?.label || m;
  }
  function renderMotionSum() {
    const box = $("motionSum");
    if (!box || !st.data) return;
    const d = st.data, sty = d.style || {}, roles = sty.roles || {};
    const rows = [];
    for (const [rk, rn] of Object.entries(S.ROLES)) {
      const n = d.captions.filter((c) => (c.role || "normal") === rk || (rk === "normal" && !c.role)).length;
      if (!n) continue;
      const m = Object.assign({}, S.BASE.cap, sty.cap, roles[rk] || {}).motion;
      const own = d.captions.filter((c) => (c.role || "normal") === rk && c.look && c.look.motion && c.look.motion !== m).length;
      rows.push(`<button class="mo-row" data-mr="${rk}"><span class="mo-role">${S.esc(rn)} <span class="muted">${n}개</span></span><span class="mo-name${m === "none" ? " off" : ""}">${S.esc(motionLabel(m))}</span>${own ? `<span class="mo-own">따로 ${own}</span>` : ""}<span class="mo-go">바꾸기 ▸</span></button>`);
    }
    const hk = (d.hooks || []).find((h) => h.id === d.hookPick) || (d.hooks || [])[0];
    if (hk) rows.push(`<button class="mo-row" data-mt="hook"><span class="mo-role">훅 등장</span><span class="mo-name">${S.esc(motionLabel(S.headValues(hk, d).motion))}</span><span class="mo-go">바꾸기 ▸</span></button>`);
    const nfx = (d.effects || []).length;
    rows.push(`<button class="mo-row" data-mt="fx"><span class="mo-role">줌 · 카메라</span><span class="mo-name${nfx ? "" : " off"}">${nfx ? nfx + "곳" : "없음"}</span><span class="mo-go">넣기 ▸</span></button>`);
    box.innerHTML = rows.join("") + `<div class="muted small mo-tip">타임라인 자막 칸의 <b>🎬</b> 뒤가 그 자막의 모션이에요</div>`;
    box.querySelectorAll("[data-mr]").forEach((b) => (b.onclick = () => { st.stTarget = "cap"; st.stScope = "role"; st.stRole = b.dataset.mr; renderStylePanel(); openBoard("motion"); }));
    box.querySelectorAll("[data-mt]").forEach((b) => (b.onclick = () => openBoard(b.dataset.mt)));
    const bc = $("boardCount");
    if (bc) bc.textContent = Object.values(S.CAPTION_MOTIONS).filter((x) => !x.hookOnly).length + "개";
  }

  function renderTimeline() {
    renderMotionSum();
    const d = st.data;
    const dur = Math.max(d.duration || 0, 1);
    const W = dur * st.pps + 80;
    $("tlInner").style.width = W + "px";
    // 눈금
    const ruler = $("ruler");
    ruler.innerHTML = "";
    const step = st.pps >= 150 ? 0.25 : 0.5;
    for (let t = 0; t <= dur + 0.001; t += step) {
      const tk = document.createElement("div");
      const major = Math.abs(t - Math.round(t)) < 0.001;
      tk.className = "tick" + (major ? "" : " minor");
      tk.style.left = t * st.pps + "px";
      if (major) tk.textContent = Math.round(t) + "s";
      ruler.appendChild(tk);
    }
    const track = (name) => document.querySelector(`.track[data-track="${name}"]`);
    if (!st.data.sfx) st.data.sfx = [];
    for (const n of ["feedback", "hooks", "panels", "captions", "overlays", "effects", "camera", "sfx"]) if (track(n)) track(n).innerHTML = "";

    const isSel = (type, id) => st.sel && st.sel.type === type && st.sel.id === id;
    const block = (type, cls, it, label) => {
      const b = document.createElement("div");
      b.className = `blk ${cls}` + (isSel(type, it.id) ? " sel" : "");
      b.style.left = it.start * st.pps + "px";
      b.style.width = Math.max(10, (it.end - it.start) * st.pps) + "px";
      b.title = `${label} (${fmt(it.start)}~${fmt(it.end)})`;
      b.innerHTML = `<span>${S.esc(label)}</span><div class="h l"></div><div class="h r"></div>`;
      b.addEventListener("pointerdown", (e) => dragBlock(e, type, it));
      return b;
    };
    const ph = S.pickedHook(viewData());
    if (ph && track("hooks")) {
      const hb = block("hook", "hook", Object.assign({}, ph, { start: ph.start || 0, end: ph.end || 3 }), hookName(ph, d.hooks.indexOf(ph)) + ": " + String(ph.text || "").replace(/\*\*/g, "").replace(/\n/g, " "));
      track("hooks").appendChild(hb);
    }
    if (track("panels")) (d.panels || []).forEach((pn) => track("panels").appendChild(block("panel", "panel", pn, "🧩 " + (S.TEMPLATES[pn.tpl] && pn.tpl !== "none" ? S.TEMPLATES[pn.tpl] + " · " : "") + (S.VIS_LAYOUTS[S.visLayoutOf(pn, d)] || {}).label + ": " + String(pn.title || pn.text || "").replace(/\*\*/g, ""))));
    d.captions.forEach((c) => track("captions").appendChild(block("caption", "cap", c, "🎬" + (S.capMotion(c, d) === "none" ? "바로" : (S.CAPTION_MOTIONS[S.capMotion(c, d)]?.label || "")) + " │ " + String(c.text).replace(/\*\*/g, "") + (c.role ? " · " + (S.ROLES[c.role] || c.role) : "") + (c.noEmphasis ? " · 효과 문장" : "") + (c.look && Object.keys(c.look).length ? " ✎" : ""))));
    d.overlays.forEach((o) => track("overlays").appendChild(block("overlay", "ov", o, o.kind === "chat" ? "💬 메신저: " + String(o.title || "환자분") : o.kind === "insert" ? "🎬 장면 컷: " + String(o.src || "").split("/").pop() : o.kind === "sticker" ? "🧸 스티커: " + String(o.src || o.emoji || "").split("/").pop() : o.kind === "emoji" ? (o.emoji || "") + " 이모지" : S.isTextKind(o.kind) ? (S.OVERLAY_KINDS[o.kind]?.label || o.kind) + ": " + String(o.text || "").replace(/\*\*/g, "").replace(/\n/g, " ") : o.kind === "app" ? "앱 타일: " + (o.text || o.emoji || "") : S.OVERLAY_KINDS[o.kind]?.label || o.kind)));
    d.effects.forEach((e) => track("effects").appendChild(block("effect", "fx", e, (S.EFFECTS[e.type]?.label || e.type) + " ×" + (e.strength ?? 1))));
    if (track("sfx")) (d.sfx || []).forEach((x) => track("sfx").appendChild(block("sfx", "sfx", x, "🔊 " + S.sfxLabel(x))));
    d.camera.forEach((k) => {
      const el = document.createElement("div");
      el.className = "kf" + (isSel("camera", k.id) ? " sel" : "");
      el.style.left = k.t * st.pps + "px";
      el.title = `카메라 ${fmt(k.t)}초 · ${k.scale}배`;
      el.addEventListener("pointerdown", (e) => dragPoint(e, "camera", k));
      track("camera").appendChild(el);
    });
    d.feedback.forEach((f) => {
      const el = document.createElement("div");
      el.className = "mark" + (f.status === "done" ? " done" : "") + (isSel("feedback", f.id) ? " sel" : "");
      el.style.left = f.t * st.pps + "px";
      el.textContent = "📍";
      el.title = `${fmt(f.t)}초 · ${f.note || "(내용 없음)"}`;
      el.addEventListener("pointerdown", (e) => dragPoint(e, "feedback", f));
      track("feedback").appendChild(el);
    });
    $("playhead").style.left = st.t * st.pps + "px";
  }

  // 블록 끌기: 몸통은 옮기기, 양 끝은 길이
  function dragBlock(e, type, it) {
    e.stopPropagation();
    e.preventDefault();
    select({ type, id: it.id });
    let mode = e.target.classList.contains("l") ? "l" : e.target.classList.contains("r") ? "r" : "m";
    if (type === "hook") {
      // 훅은 0초부터 시작: 끝만 바꾼다
      it = find({ type, id: it.id });
      if (it.start == null) it.start = 0;
      if (mode !== "r") mode = "none";
    }
    const sx = e.clientX, s0 = it.start, e0 = it.end;
    let moved = false;
    const dur = st.data.duration || 999;
    const snap = (t) => {
      // 재생 위치와 1/30초 칸에 붙기
      if (Math.abs(t - st.t) * st.pps < 6) return st.t;
      return Math.round(t * FPS) / FPS;
    };
    const move = (ev) => {
      const dt = (ev.clientX - sx) / st.pps;
      if (!moved && Math.abs(ev.clientX - sx) < 3) return;
      if (mode === "none") return;
      if (!moved) snapshot();
      moved = true;
      if (mode === "m") {
        const len = e0 - s0;
        it.start = r2(clamp(snap(s0 + dt), 0, dur - len));
        it.end = r2(it.start + len);
      } else if (mode === "l") it.start = r2(clamp(snap(s0 + dt), 0, it.end - 0.05));
      else it.end = r2(clamp(snap(e0 + dt), it.start + 0.05, dur));
      renderTimeline();
      renderInspector();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) changed();
      else seek(clamp((e.clientX - $("tlInner").getBoundingClientRect().left) / st.pps, 0, dur));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragPoint(e, type, it) {
    e.stopPropagation();
    e.preventDefault();
    select({ type, id: it.id });
    seek(it.t);
    const sx = e.clientX, t0 = it.t;
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) < 3) return;
      if (!moved) snapshot();
      moved = true;
      it.t = r2(clamp(Math.round((t0 + (ev.clientX - sx) / st.pps) * FPS) / FPS, 0, st.data.duration || 999));
      renderTimeline();
      renderInspector();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) { changed(); seek(it.t); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function initTimelineSeek() {
    const onDown = (e) => {
      if (e.target.closest(".blk, .kf, .mark")) return;
      const inner = $("tlInner").getBoundingClientRect();
      const go = (ev) => seek((ev.clientX - inner.left) / st.pps);
      go(e);
      const up = () => { window.removeEventListener("pointermove", go); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", go);
      window.addEventListener("pointerup", up);
    };
    $("ruler").addEventListener("pointerdown", onDown);
    document.querySelectorAll(".track").forEach((t) => t.addEventListener("pointerdown", onDown));
  }

  // ── 속성 패널 ──
  function field(label, html) {
    return `<div class="f"><label>${label}</label><div>${html}</div></div>`;
  }
  const num = (k, v, step = 0.01) => `<input type="number" data-k="${k}" value="${v ?? ""}" step="${step}">`;
  const txt = (k, v) => `<input type="text" data-k="${k}" value="${S.esc(v ?? "")}">`;
  const sel = (k, v, opts) => `<select data-k="${k}">${opts.map(([val, lab]) => `<option value="${val}"${val === v ? " selected" : ""}>${lab}</option>`).join("")}</select>`;
  const range = (k, v, min, max, step) => `<input type="range" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${step}"> <span class="muted">${v}</span>`;

  function renderInspector() {
    const box = $("inspector");
    const it = find(st.sel);
    if (!it) {
      box.innerHTML = `<div class="muted small">화면이나 타임라인에서 고르세요</div>`;
      return;
    }
    const time = field("시작", num("start", it.start)) + field("끝", num("end", it.end));
    let h = "";
    if (st.sel.type === "caption") {
      h = `<div class="type" style="color:var(--cap)">자막</div>` +
        `<textarea data-k="text">${S.esc(it.text)}</textarea>` + time +
        field("가로 x", num("x", it.x ?? 540, 1)) +
        field("역할", sel("role", it.role || "", [["", "(없음)"], ...Object.entries(S.ROLES)])) +
        `<label class="chk"><input type="checkbox" data-k="noEmphasis"${it.noEmphasis ? " checked" : ""}> 효과 문장 — 강조하지 않음</label>` +
        `<div class="muted small">본인이 말한 효과 · 후기 문장(「잘 나을 수 있는 병입니다」 등)은 체크: 강조 표시 · 역할 모양 · 줌 · 효과음 제안 · 하이라이트에서 빠져요</div>` +
        `<div class="muted small">**두 별표** 사이 글자는 강조. 모양 · 색 · 모션은 오른쪽 「스타일」에서 「선택한 자막만」 또는 「같은 역할 자막에」로 바꿔요</div>` +
        `<div class="btns"><button data-act="styleSel">이 자막 모양 바꾸기 →</button></div>` +
        `<div class="btns"><button data-act="split">재생 위치에서 나누기</button><button data-act="dup">복제</button><button data-act="del" class="danger">지우기</button></div>`;
    } else if (st.sel.type === "overlay") {
      const vids = [...new Set([...(st.media.videos || []), it.src || ""].filter(Boolean))];
      const imgs = [...new Set([...(st.media.images || []), it.src || ""].filter(Boolean))];
      if (it.kind === "insert") {
        h = `<div class="type" style="color:var(--ov)">🎬 장면 컷 끼우기</div>` +
          `<div class="muted small">다른 영상이 이 시간 동안 화면 전체를 덮어요. 목소리는 계속 들려요</div>` +
          field("영상", sel("src", it.src || "", vids.map((v) => [v, v.split("/").pop()]))) +
          field("영상 몇 초부터", num("from", it.from ?? 0, 0.1)) + time +
          field("이 영상 소리", sel("muted", it.muted === false ? "0" : "1", [["1", "끔 (기본)"], ["0", "켬"]])) +
          field("들어올 때", sel("enter", it.enter || "cut", Object.entries(S.INSERT_TRANS))) +
          field("나갈 때", sel("exit", it.exit || "cut", Object.entries(S.INSERT_TRANS))) +
          layoutFields(it, "") +
          `<div class="muted small">영상은 media/ 폴더에 넣으면 목록에 나와요</div>` +
          `<div class="btns"><button data-act="dup">복제</button><button data-act="del" class="danger">지우기</button></div>`;
        box.innerHTML = h;
        bindInspector(box, it);
        return;
      }
      if (it.kind === "chat") {
        h = `<div class="type" style="color:var(--ov)">💬 대화 화면 (메신저)</div>` +
          `<div class="muted small">실제 메신저 화면 구조 (앱 로고 · 이름 없음, 실제 캡처 쓰지 않음). 줄마다 「상대: 내용 @오후 2:10」 · 「나: 내용」, **두 별표**는 노랑 형광</div>` +
          field("상대 이름", txt("title", it.title || "환자분")) + chatFields(it) + time +
          layoutFields(it, "(레이아웃 없이 원하는 자리)") +
          (!it.layout ? field("가로 x", num("x", it.x ?? 540, 1)) + field("세로 y (위쪽)", num("y", it.y ?? 260, 1)) + field("너비", num("w", it.w || 900, 10)) + field("높이", num("h", it.h || 1180, 10)) : "") +
          field("퇴장", sel("exit", it.exit || "none", [["none", "바로"], ["pop", "작아지며 사라짐"]])) +
          `<div class="btns"><button data-act="dup">복제</button><button data-act="del" class="danger">지우기</button></div>`;
        box.innerHTML = h;
        bindInspector(box, it);
        return;
      }
      if (it.kind === "sticker") {
        h = `<div class="type" style="color:var(--ov)">🧸 이미지 스티커</div>` +
          `<div class="muted small">투명 PNG(캐릭터 · 귀여운 요소). 말풍선과 같이 쓰면 말하는 것처럼 보여요</div>` +
          (imgs.length ? field("이미지", sel("src", it.src || "", [["", "(이모지 쓰기)"], ...imgs.map((v) => [v, v.split("/").pop()])])) : "") +
          field("이미지 경로", txt("src", it.src)) + (!it.src ? field("이모지", txt("emoji", it.emoji)) : "") + time +
          field("가로 x", num("x", it.x, 1)) + field("세로 y", num("y", it.y, 1)) + field("크기", num("size", it.size || 260, 1)) + field("기울기 (도)", num("rot", it.rot ?? 0, 1)) +
          field("등장", sel("enter", it.enter || "pop", [["pop", "톡 커지기"], ["slam", "크게 쾅"], ["rise", "아래서 올라옴"], ["fade", "서서히"], ["none", "바로"]])) +
          field("계속 움직임", sel("idle", it.idle || "float", Object.entries(S.STICKER_IDLE))) +
          field("퇴장", sel("exit", it.exit || "none", [["none", "바로"], ["pop", "작아지며 사라짐"]])) +
          `<div class="btns"><button data-act="dup">복제</button><button data-act="del" class="danger">지우기</button></div>`;
        box.innerHTML = h;
        bindInspector(box, it);
        return;
      }
      h = `<div class="type" style="color:var(--ov)">아이콘 · 위 글자</div>` +
        field("종류", sel("kind", it.kind, Object.entries(S.OVERLAY_KINDS).map(([k, v]) => [k, v.label]))) +
        (it.kind === "emoji" ? field("이모지", txt("emoji", it.emoji)) + field("바탕색", `<input type="color" data-k="bg" value="${it.bg || "#ffffff"}">`) : "") +
        (it.kind === "title" ? field("글자", txt("text", it.text)) + field("글자 크기", num("fontSize", it.fontSize || 64, 1)) + field("바탕색", `<input type="color" data-k="bg" value="${it.bg || "#111111"}">`) + field("글자색", `<input type="color" data-k="color" value="${it.color || "#ffffff"}">`) : "") +
        (["headline", "chapter", "bubble"].includes(it.kind) ? `<textarea data-k="text">${S.esc(it.text || "")}</textarea><div class="muted small">**두 별표** 사이 글자는 강조색, 엔터는 줄바꿈</div>` + field("글자 크기", num("fontSize", it.fontSize || (it.kind === "headline" ? 110 : 48), 1)) : "") +
        (it.kind === "app" ? field("글자 · 이름", txt("text", it.text)) + field("이모지", txt("emoji", it.emoji)) + field("이미지 경로", txt("src", it.src)) + field("기울기 (도)", num("rot", it.rot ?? -8, 1)) : "") +
        (it.kind === "screen" ? field("영상 경로", txt("src", it.src)) + field("영상 너비", num("w", it.w || 1000, 1)) + field("서서히 확대 (1=없음)", num("zoom", it.zoom ?? 1, 0.01)) : "") +
        (it.kind === "aside" ? `<div class="muted small">위 절반에 어사이드 창, 아래 절반에 얼굴 (분할). 프롬프트는 원문 그대로</div><textarea data-k="prompt" style="height:120px">${S.esc(it.prompt || "")}</textarea>` + field("얼굴 내리는 정도 (px)", num("shift", it.shift ?? 500, 1)) + `<div class="muted small">질문 · 보기 · 시각은 edit.json 의 questions · times 에서 고쳐요</div>` : "") +
        (it.kind === "quiz" ? field("질문", txt("text", it.text)) + field("보기 (| 로 나눔)", txt("options", it.options)) + field("몇 번째 질문", num("qnum", it.qnum || 1, 1)) + field("고를 보기 (0부터)", num("pick", it.pick ?? 0, 1)) + field("고르는 때 (시작 뒤 초)", num("pickAt", it.pickAt ?? 0.9)) : "") +
        time + field("가로 x", num("x", it.x, 1)) + field("세로 y", num("y", it.y, 1)) +
        (!S.isTextKind(it.kind) || it.kind === "bubble" ? field("크기", num("size", it.size || 200, 1)) : "") +
        field("등장", sel("enter", it.enter || "pop", [["pop", "톡 커지기"], ["slam", "크게 쾅"], ["rise", "아래서 올라옴"], ["fade", "서서히"], ["none", "바로"]])) +
        field("퇴장", sel("exit", it.exit || "none", [["none", "바로"], ["pop", "작아지며 사라짐"]])) +
        (it.kind === "folder-burst" ? field("흩어지는 때", num("burstAt", it.burstAt ?? 1.1) + `<div class="muted small">시작부터 몇 초 뒤</div>`) : "") +
        `<div class="btns"><button data-act="dup">복제</button><button data-act="del" class="danger">지우기</button></div>`;
    } else if (st.sel.type === "sfx") {
      h = `<div class="type" style="color:#ff9f1a">🔊 효과음</div>` +
        field("소리", sel("name", it.name || "", [...(it.name && S.SFX_LIB[it.name] ? [] : [[it.name || "", "파일 그대로: " + S.sfxLabel(it)]]), ...Object.entries(S.SFX_LIB).map(([k, v]) => [k, v.label])])) + time +
        field("크기", range("volume", it.volume ?? 0.35, 0.05, 1, 0.05)) +
        `<div class="btns"><button data-act="sfxPlay">▶ 들어 보기</button></div>` +
        `<div class="muted small">말보다 작게 (0.3 안팎). 끝을 끌면 소리가 잘려요</div>` +
        `<div class="btns"><button data-act="dup">복제</button><button data-act="del" class="danger">지우기</button></div>`;
    } else if (st.sel.type === "effect") {
      h = `<div class="type" style="color:var(--fx)">효과</div>` +
        field("종류", sel("type", it.type, Object.entries(S.EFFECTS).map(([k, v]) => [k, v.label]))) + time +
        field("길이 (초)", num("_len", r2(it.end - it.start), 0.05)) +
        field("세기", range("strength", it.strength ?? 1, 0.3, 3, 0.1)) +
        field("움직임", sel("ease", it.ease || "smooth", [["smooth", "부드럽게"], ["snap", "툭 (빠르게 멈춤)"], ["bounce", "튕김"]])) +
        field("기준점 x", num("ax", it.ax ?? 540, 1)) + field("기준점 y", num("ay", it.ay ?? 800, 1)) +
        `<div class="muted small">노란 동그라미를 끌어 어디를 중심으로 줌할지 정해요</div>` +
        `<div class="btns"><button data-act="dup">복제</button><button data-act="del" class="danger">지우기</button></div>`;
    } else if (st.sel.type === "panel") {
      const imgs = [...new Set([...(st.media.images || []), it.image || ""].filter(Boolean))];
      h = `<div class="type" style="color:#3fb6a8">🧩 그림판 (시각 자료)</div>` +
        layoutFields(it, null) +
        field("템플릿", sel("tpl", it.tpl || "none", Object.entries(S.TEMPLATES))) + tplFields(it) +
        (it.tpl === "chat" ? field("상대 이름", txt("chatTitle", it.chatTitle || "환자분")) + chatFields(it) : "") +
        `<label class="muted small">제목</label><textarea data-k="title">${S.esc(it.title || "")}</textarea>` +
        `<label class="muted small">설명 글 (선택)</label><textarea data-k="text">${S.esc(it.text || "")}</textarea>` + time +
        field("이미지", sel("image", it.image || "", [["", "(없음)"], ...imgs.map((v) => [v, v.split("/").pop()])])) +
        field("바탕색", `<input type="color" data-k="bg" value="${it.bg || (it.layout === "float" ? "#ffffff" : "#f3f4f6")}">`) +
        field("들어올 때", sel("enter", it.enter || "auto", [["auto", "레이아웃에 맞게"], ...Object.entries(S.PANEL_TRANS)])) +
        `<label class="muted small">선 그어 짚기 (줄마다 「가로%,세로%,라벨」)</label><textarea data-k="callouts" placeholder="32,62,합곡">${S.esc(it.callouts || "")}</textarea>` +
        `<div class="muted small">**두 별표** 사이는 강조, 엔터는 줄바꿈. 숫자는 영상에서 말한 것만</div>` +
        `<div class="btns"><button data-act="dup">복제</button><button data-act="del" class="danger">지우기</button></div>`;
    } else if (st.sel.type === "hook") {
      const i = st.data.hooks.indexOf(it);
      const hs = it.style || {};
      const picked = S.pickedHook(st.data) === it;
      h = `<div class="type" style="color:var(--accent)">훅 ${"ABCDEFG"[i] || ""} ${picked ? "· 렌더에 들어가는 훅" : ""}</div>` +
        field("이름", txt("label", it.label)) +
        `<textarea data-k="text" placeholder="첫 줄\n**강조** 둘째 줄">${S.esc(it.text || "")}</textarea><div class="muted small">두 줄까지 (엔터로 줄바꿈). **두 별표** 사이는 강조</div>` +
        field("끝 시각 (초)", num("end", it.end ?? 3, 0.1)) +
        field("등장 모션", sel("look.motion", S.headValues(it, st.data).motion, Object.entries(S.CAPTION_MOTIONS).map(([k, v]) => [k, v.label]))) +
        field("줌 효과", sel("zoom", (typeof it.zoom === "string" ? it.zoom : it.zoom?.type) || "", [["", "(없음)"], ...Object.entries(S.EFFECTS).map(([k, v]) => [k, v.label])])) +
        field("스티커", txt("sticker", it.sticker) + `<div class="muted small">이모지(🔥) 또는 이미지 경로</div>`) +
        `<div class="muted small">글꼴 · 색 · 크기 · 위치는 오른쪽 「스타일」→「훅 제목」에서 (모든 훅 / 고른 훅만)</div>` +
        `<div class="btns">${picked ? "" : `<button data-act="pickHook" class="accent">이 훅으로 정하기</button>`}<button data-act="playHook">▶ 처음부터 보기</button><button data-act="del" class="danger">지우기</button></div>`;
    } else if (st.sel.type === "camera") {
      h = `<div class="type" style="color:var(--cam)">◆ 카메라 키프레임</div>` +
        field("시각", num("t", it.t)) + field("확대", range("scale", it.scale ?? 1, 1, 1.8, 0.01)) +
        field("기준점 x", num("ax", it.ax ?? 540, 1)) + field("기준점 y", num("ay", it.ay ?? 800, 1)) +
        field("움직임", sel("ease", it.ease || "power1.inOut", [["power1.inOut", "부드럽게"], ["power3.out", "빠르게 들어가 멈춤"], ["none", "일정하게"], ["steps(1)", "뚝 끊기"]])) +
        `<div class="muted small">이전 키프레임에서 이 키프레임까지 움직이는 방식. 키프레임 두 개 이상이면 그 사이를 움직여요</div>` +
        `<div class="btns"><button data-act="del" class="danger">지우기</button></div>`;
    } else if (st.sel.type === "feedback") {
      h = `<div class="type" style="color:var(--fb)">📍 피드백</div>` +
        field("시각", num("t", it.t)) + `<textarea data-k="note" id="fbNote" placeholder="몇 초에 무엇을 어떻게 (예: 자막 더 크게, 여기서 줌 인)">${S.esc(it.note || "")}</textarea>` +
        field("상태", sel("status", it.status || "open", [["open", "○ 대기"], ["done", "✔ 반영됨"]])) +
        `<div class="btns"><button data-act="del" class="danger">지우기</button></div>`;
    }
    box.innerHTML = h;
    bindInspector(box, it);
  }

  // 시각 자료 레이아웃 칸 (그림판 · 대화 · 장면 컷 공용)
  const layoutFields = (it, allowNone) =>
    field("레이아웃", sel("layout", it.layout || "", [...(allowNone ? [["", allowNone]] : []), ...Object.entries(S.VIS_LAYOUTS).map(([k, v]) => [k, v.label])])) +
    (it.layout === "pip" ? field("얼굴 동그라미", sel("pipPos", it.pipPos || "tr", Object.entries(S.PIP_POS))) : "") +
    `<div class="muted small">🎬 「레이아웃」 탭에서 5가지를 나란히 보고 고를 수 있어요. 반반일 때 자막은 얼굴을 피해 자동으로 옮겨져요</div>`;
  const chatFields = (it) =>
    field("테마", sel("theme", it.theme || "yellow", Object.entries(S.CHAT_THEMES).map(([k, v]) => [k, v.label]))) +
    `<label class="chk"><input type="checkbox" data-k="frame"${it.frame !== false ? " checked" : ""}> 폰 테두리</label> ` +
    `<label class="chk"><input type="checkbox" data-k="hideName"${it.hideName ? " checked" : ""}> 이름 가리기 (첫 글자 + OO)</label><br>` +
    `<label class="chk"><input type="checkbox" data-k="showTime"${it.showTime !== false ? " checked" : ""}> 시각</label> <label class="chk"><input type="checkbox" data-k="showRead"${it.showRead !== false ? " checked" : ""}> 안 읽음 1</label>` +
    `<textarea data-k="_messages" style="height:110px" placeholder="상대: 원장님 질문 있어요 @오후 2:10">${S.esc(msgsToText(it.messages))}</textarea>` +
    field("말풍선 모션", sel("bubbleAnim", it.bubbleAnim || "pop", Object.entries(S.CHAT_ANIMS))) + field("말풍선 사이 (초)", num("gap", it.gap ?? 0.9, 0.1));
  // 템플릿마다 칸: [키, 이름, 종류(text · area · select)]
  const TPL_FIELDS = {
    bigNumber: [["number", "숫자 (말한 숫자만)", "text"], ["unit", "단위", "text"], ["desc", "한 줄 설명", "text"]],
    compare: [["leftLabel", "왼쪽 이름", "text"], ["leftValue", "왼쪽 값", "text"], ["rightLabel", "오른쪽 이름", "text"], ["rightValue", "오른쪽 값", "text"]],
    checklist: [["items", "항목 (줄마다)", "area"]],
    calendar: [["year", "연도", "text"], ["month", "월", "text"], ["marks", "동그라미 칠 날짜 (쉼표로)", "text"]],
    route: [["from", "출발", "text"], ["to", "도착", "text"], ["mode", "이동", "mode"]],
    quote: [["text", "말 (그대로)", "area"], ["source", "출처", "text"]],
    timeline: [["items", "구간 (줄마다 「이름,길이 숫자,표시 글」)", "area"]],
  };
  const tplFields = (it) => {
    const fs = TPL_FIELDS[it.tpl];
    if (!fs) return "";
    const td = Object.assign({}, S.TPL_SAMPLE[it.tpl] || {}, it.tplData || {});
    return fs.map(([k, lab, ty]) => ty === "area" ? `<label class="muted small">${lab}</label><textarea data-k="tplData.${k}">${S.esc(td[k] || "")}</textarea>`
      : ty === "mode" ? field(lab, sel("tplData." + k, td[k] || "train", Object.entries(S.ROUTE_MODES))) : field(lab, `<input type="text" data-k="tplData.${k}" value="${S.esc(td[k] || "")}">`)).join("") +
      (it.tpl === "compare" ? `<div class="muted small">사실 비교만 (예: 처음 3일에 한 번 → 지금 2일에 한 번). 치료 전후 비교 · 효과 보장 표현에는 쓰지 않아요</div>` : "");
  };

  // 메신저 말풍선: 줄마다 「상대: 내용 @오후 2:10」 / 「나: 내용」
  const msgsToText = (ms) => (ms || []).map((m) => `${m.from === "me" ? "나" : "상대"}: ${m.text}${m.at ? " @" + m.at : ""}`).join("\n");
  const textToMsgs = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const mm = /^(나|me|상대|them)\s*[:：]\s*(.*)$/i.exec(l);
    const from = mm && /^(나|me)$/i.test(mm[1]) ? "me" : "them";
    let body = mm ? mm[2] : l, at = "";
    const ai = body.lastIndexOf(" @");
    if (ai > 0) { at = body.slice(ai + 2).trim(); body = body.slice(0, ai).trim(); }
    return at ? { from, text: body, at } : { from, text: body };
  });
  const SAMPLE_MSGS = [{ from: "them", text: "원장님 **두드러기**가 또 났어요", at: "오후 2:10" }, { from: "me", text: "언제부터 그러셨어요?", at: "오후 2:11" }, { from: "them", text: "약 먹은 날짜를 세고 있어요", at: "오후 2:12" }];

  // 속성 입력 → 데이터 (k 가 "style.look" 처럼 점이 있으면 안쪽 객체)
  function bindInspector(box, it) {
    box.querySelectorAll("[data-k]").forEach((inp) => {
      const k = inp.dataset.k;
      const ev = inp.tagName === "TEXTAREA" || inp.type === "text" ? "input" : inp.type === "range" || inp.type === "color" ? "input" : "change";
      let snapped = false;
      inp.addEventListener(ev, () => {
        if (!snapped) { snapshot(); snapped = true; }
        let v = inp.type === "checkbox" ? inp.checked : inp.value;
        if (inp.type === "number" || inp.type === "range") v = parseFloat(v);
        if (inp.type === "range") inp.nextElementSibling.textContent = v;
        if (Number.isNaN(v)) return;
        if (k === "noEmphasis" && !v) { delete it.noEmphasis; changed(false); return; }
        if (k === "muted") v = v === "1";
        if (k === "_len") { it.end = r2(it.start + Math.max(0.05, v)); changed(false); return; }
        if (k === "_messages") { it.messages = textToMsgs(v); changed(false); return; }
        if (k.includes(".")) {
          const [a, b] = k.split(".");
          it[a] = Object.assign({}, it[a]);
          if (v === "" || v == null) delete it[a][b]; else it[a][b] = v;
        } else if (v === "" && (k === "motion" || k === "zoom" || k === "sticker" || k === "role")) delete it[k];
        else it[k] = v;
        if (k === "motion") delete it.enter;
        if (k === "kind" && v === "emoji" && !it.emoji) it.emoji = "📄";
        if (st.sel.type === "sfx" && k === "name") { it.file = "sfx/" + v + ".mp3"; it.end = r2(it.start + (S.SFX_LIB[v]?.dur || 0.6)); }
        if (k === "kind" && v === "title" && !it.text) it.text = "위 글자";
        if (k === "end" && it.end <= it.start) it.end = r2(it.start + 0.1);
        if (k === "tpl" && v === "chat" && !(it.messages && it.messages.length)) it.messages = JSON.parse(JSON.stringify(SAMPLE_MSGS));
        changed(k === "kind" || k === "type" || k === "chart" || k === "tpl" || k === "layout" || k === "theme" || (st.sel.type === "overlay" && k === "src"));
        if (k === "t") seek(it.t);
      });
      inp.addEventListener("blur", () => (snapped = false));
    });
    box.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => act(b.dataset.act)));
  }

  function act(a) {
    const it = find(st.sel);
    if (!it) return;
    if (a === "pickHook") return pickHook(it.id, true);
    if (a === "playHook") return playHook(it.id);
    if (a === "sfxPlay") return playSfx(it.name, it.volume ?? 0.35);
    if (a === "styleSel") { st.stTarget = "cap"; st.stScope = "sel"; renderStylePanel(); $("stFields").scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
    const list = items(st.sel.type);
    snapshot();
    if (a === "del") {
      list.splice(list.indexOf(it), 1);
      if (st.sel.type === "hook" && st.data.hookPick === it.id) st.data.hookPick = st.data.hooks[0]?.id ?? null;
      st.sel = null;
    } else if (a === "dup") {
      const c = JSON.parse(JSON.stringify(it));
      c.id = uid(st.sel.type.slice(0, 3));
      const len = c.end - c.start;
      c.start = r2(Math.min(it.end, (st.data.duration || 99) - len));
      c.end = r2(c.start + len);
      list.push(c);
      st.sel = { type: st.sel.type, id: c.id };
    } else if (a === "split") {
      if (st.t <= it.start + 0.05 || st.t >= it.end - 0.05) return toast("재생 위치를 자막 안쪽에 두고 나누세요");
      const c = JSON.parse(JSON.stringify(it));
      c.id = uid("cap");
      c.start = r2(st.t);
      it.end = r2(st.t);
      list.splice(list.indexOf(it) + 1, 0, c);
      st.sel = { type: "caption", id: c.id };
      toast("나눴어요. 뒤쪽 자막 글자를 고쳐 주세요");
    }
    changed(true);
  }

  // ── 피드백 목록 ──
  function renderFeedback() {
    const list = st.data.feedback.slice().sort((a, b) => a.t - b.t);
    const open = list.filter((f) => f.status !== "done").length;
    $("fbCount").textContent = list.length ? `대기 ${open} · 전체 ${list.length}` : "";
    $("fbList").innerHTML = list.length
      ? list
          .map(
            (f) =>
              `<div class="fb${f.status === "done" ? " done" : ""}" data-id="${f.id}"><button class="t">${fmt(f.t)}초</button><div class="note">${S.esc(f.note || "(내용을 적어 주세요)")}</div><input type="checkbox" title="반영됨" ${f.status === "done" ? "checked" : ""}><button class="x" title="지우기">✕</button></div>`
          )
          .join("")
      : `<div class="muted small">재생하다가 📍 버튼(F)을 누르면 그 시각에 피드백이 남아요</div>`;
    $("fbList").querySelectorAll(".fb").forEach((row) => {
      const f = st.data.feedback.find((x) => x.id === row.dataset.id);
      row.querySelector(".t").onclick = () => { seek(f.t); select({ type: "feedback", id: f.id }); };
      row.querySelector(".note").onclick = () => { seek(f.t); select({ type: "feedback", id: f.id }); setTimeout(() => $("fbNote")?.focus(), 0); };
      row.querySelector("input").onchange = (e) => { snapshot(); f.status = e.target.checked ? "done" : "open"; changed(false); };
      row.querySelector(".x").onclick = () => { snapshot(); st.data.feedback.splice(st.data.feedback.indexOf(f), 1); changed(true); };
    });
  }

  // ── 스타일 패널: 값을 하나씩 고른다 ──
  // 대상(무엇을): cap 자막 · head 훅 제목 · bubble 말풍선 · chapter 챕터
  // 범위(어디에): all 전체 · sel 선택한 것만 · role 같은 역할 자막에
  const TARGETS = { cap: "자막", head: "훅 제목", bubble: "말풍선", chapter: "챕터" };
  const SCOPES = {
    cap: { all: "전체 자막에", sel: "선택한 자막만", role: "같은 역할 자막에" },
    head: { all: "모든 훅에", sel: "고른 훅만" },
    bubble: { all: "모든 말풍선에", sel: "선택한 말풍선만" },
    chapter: { all: "모든 챕터에", sel: "선택한 챕터만" },
  };
  const LEGACY = { size: "size", color: "color", y: "y", motion: "motion" };

  function selectedOf(kind) {
    const it = find(st.sel);
    if (kind === "cap") return st.sel && st.sel.type === "caption" ? it : null;
    if (kind === "head") return S.pickedHook(st.data);
    return st.sel && st.sel.type === "overlay" && it && it.kind === kind ? it : null;
  }
  // 지금 범위에서 보이는 값 (위에서 내려온 값까지 합친 최종값)과, 이 범위에서 직접 정한 값
  function scopeValues() {
    const d = st.data, sty = d.style, T = st.stTarget, sc = st.stScope;
    const base = S.BASE[T];
    if (sc === "role" && T === "cap") {
      const own = sty.roles[st.stRole] || {};
      return { vals: Object.assign({}, base, sty.cap, own), own };
    }
    if (sc === "sel") {
      const it = selectedOf(T);
      if (!it) return null;
      const vals = T === "cap" ? S.capValues(it, d) : T === "head" ? S.headValues(it, d) : S.ovValues(it, d);
      return { vals, own: it.look || {} };
    }
    return { vals: Object.assign({}, base, sty[T]), own: sty[T] || {} };
  }
  // 값 하나 바꾸기
  function setVal(k, v) {
    const d = st.data, sty = d.style, T = st.stTarget, sc = st.stScope;
    if (sc === "role" && T === "cap") {
      sty.roles[st.stRole] = Object.assign({}, sty.roles[st.stRole], { [k]: v });
    } else if (sc === "sel") {
      const it = selectedOf(T);
      if (!it) return toast("먼저 화면이나 타임라인에서 하나를 고르세요");
      it.look = Object.assign({}, it.look, { [k]: v });
      if (T === "cap" && LEGACY[k]) delete it[LEGACY[k]];
      if (T === "cap" && k === "motion") delete it.enter;
    } else {
      sty[T] = Object.assign({}, sty[T], { [k]: v });
      // 「전체에」: 하나하나 따로 정한 같은 값은 지워서 전체를 따르게 (역할 값은 그대로)
      if (T === "cap") d.captions.forEach((c) => { if (c.look) delete c.look[k]; if (LEGACY[k]) delete c[LEGACY[k]]; if (k === "motion") delete c.enter; });
      if (T === "head") d.hooks.forEach((h) => {
        if (h.look) delete h.look[k];
        if (h.style) { delete h.style.look; if (k === "size") delete h.style.size; if (k === "y") delete h.style.y; }
        if (k === "motion") delete h.enter;
      });
      if (T === "bubble" || T === "chapter") d.overlays.forEach((o) => { if (o.kind === T && o.look) delete o.look[k]; });
    }
    if (/color/i.test(k) && typeof v === "string") rememberColor(v);
    if (st.bulk) return;
    changed(false);
    if (k === "motion" || k === "speed" || k === "delay") (T === "head" ? playHook(S.pickedHook(st.data)?.id) : previewCaption());
  }
  // 여러 값을 한 번에 (시작점 · 레퍼런스 값 · 내 스타일)
  function setVals(obj) {
    const keys = S.TARGET_KEYS[st.stTarget];
    st.bulk = true;
    try { for (const [k, v] of Object.entries(obj || {})) if (keys.includes(k)) setVal(k, v); } finally { st.bulk = false; }
  }

  function renderStylePanel() {
    const T = st.stTarget, sc = st.stScope;
    if (!SCOPES[T][sc]) st.stScope = "all";
    const selId = st.sel ? st.sel.type + ":" + st.sel.id : "";
    const sig = [T, st.stScope, st.stRole, selId, st.data.hookPick].join("|");
    if ($("stFields").dataset.sig !== sig) {
      $("stFields").dataset.sig = sig;
      $("stTarget").innerHTML = Object.entries(TARGETS).map(([k, v]) => `<button data-t="${k}" class="${k === T ? "on" : ""}">${v}</button>`).join("");
      $("stScope").innerHTML = Object.entries(SCOPES[T]).map(([k, v]) => `<button data-s="${k}" class="${k === st.stScope ? "on" : ""}">${v}</button>`).join("");
      $("stRoleRow").classList.toggle("hidden", !(T === "cap" && st.stScope === "role"));
      $("stRole").innerHTML = Object.entries(S.ROLES).map(([k, v]) => `<option value="${k}"${k === st.stRole ? " selected" : ""}>${v}</option>`).join("");
      $("stPreset").innerHTML = Object.entries(S.STYLE_PRESETS).filter(([, v]) => !v.old).map(([k, v]) => `<option value="${k}">${S.esc(v.label)} — ${S.esc(v.desc)}</option>`).join("");
      $("stTarget").querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { st.stTarget = b.dataset.t; renderStylePanel(); }));
      $("stScope").querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { st.stScope = b.dataset.s; renderStylePanel(); }));
      buildFields();
    }
    syncFields();
    renderChips();
    renderMyStyles();
  }
  function buildFields() {
    const T = st.stTarget;
    const sv = scopeValues();
    const info = $("stInfo");
    const n = st.data.captions.filter((c) => c.role === st.stRole).length;
    info.textContent = !sv ? (T === "cap" ? "자막을 하나 고르면 그 자막만 바꿀 수 있어요" : "하나를 먼저 고르세요")
      : T === "cap" && st.stScope === "role" ? `「${S.ROLES[st.stRole]}」 역할 자막 ${n}개에 적용 (자막을 고르고 「선택한 것」에서 역할을 달아요)`
      : T === "cap" && st.stScope === "all" ? "모든 자막에 적용 (역할 · 하나만 바꾼 값은 위에 덮여요)" : "";
    if (!sv) { $("stFields").innerHTML = ""; return; }
    const keys = S.TARGET_KEYS[T];
    const groups = {};
    for (const f of S.VALUE_FIELDS) if (keys.includes(f[1])) (groups[f[0]] = groups[f[0]] || []).push(f);
    const openG = st.openGroups || (st.openGroups = { "글자": true });
    const MAIN = Object.entries(S.STYLE_PRESETS).filter(([, p]) => !p.old);
    const bgCards = (T === "cap" || T === "head") ? `<div class="bg-pick"><div class="bg-lab">글자 모양 고르기 <span class="muted small">누르면 글꼴 · 배경 · 색 · 꾸밈이 한 번에 (모션 · 위치는 그대로) · 움직이는 모습은 🎬 「글자 모양」 탭</span></div>` +
      S.LOOK_GROUPS.map((g) => `<div class="bg-grp">${g}</div><div class="bg-grid">` + MAIN.filter(([, p]) => p.group === g).map(([k, p]) => {
        const look = p[T === "head" ? "head" : "cap"];
        const v = Object.assign({}, S.BASE[T], look, { size: 72 });
        const on = ["font", "boxOn", "boxColor", "color", "emMode", "emColor", "fx", "nametag"].every((x) => String(sv.vals[x]).toLowerCase() === String(Object.assign({}, S.BASE[T], look)[x]).toLowerCase());
        return `<button class="bg-card${on ? " on" : ""}" data-bg="${k}" title="${S.esc(p.desc)}"><div class="bg-prev bgp-${k}"><div class="chip-in"><div class="sf-cap"><span class="sf-m"><span class="sf-cl">${S.splitRich(bgSample())}</span></span></div></div></div><b>${S.esc(p.label)}</b></button>` +
          `<style>${S.valuesCSS(".bgp-" + k + " .sf-cap", v, ".sf-cl")}</style>`;
      }).join("") + `</div>`).join("") + `</div>` : "";
    $("stFields").innerHTML = bgCards + Object.entries(groups).map(([g, fs]) =>
      `<details class="grp" data-g="${g}"${openG[g] ? " open" : ""}><summary>${g}</summary>` + fs.map(fieldHTML).join("") + `</details>`).join("") +
      (st.stScope !== "all" ? `<div class="btns"><button id="stClear" class="small-btn">이 범위에서 바꾼 값 지우기</button></div>` : "");
    $("stFields").querySelectorAll("details.grp").forEach((dt) => dt.addEventListener("toggle", () => (openG[dt.dataset.g] = dt.open)));
    $("stFields").querySelectorAll("[data-v]").forEach(bindField);
    $("stFields").querySelectorAll("[data-bg]").forEach((b) => (b.onclick = () => {
      const p = S.STYLE_PRESETS[b.dataset.bg];
      snapshot();
      // 그 스타일의 모든 모양 값(기본값 + 스타일 값)을 채움. 모션 · 위치는 지금 것 그대로
      const look = Object.assign({}, S.BASE[st.stTarget], p[st.stTarget === "head" ? "head" : "cap"]);
      KEEP_KEYS.forEach((k) => delete look[k]);
      setVals(look);
      changed(true);
      toast(`스타일: ${S.esc(p.label)} 적용 (${st.stScope === "role" ? S.ROLES[st.stRole] + " 역할" : st.stScope === "sel" ? "고른 것" : "전체"})`, 2200);
    }));
    $("stFields").querySelectorAll("[data-drop]").forEach((b) => (b.onclick = () => pickColor(b.dataset.drop)));
    $("stFields").querySelectorAll("[data-board]").forEach((b) => (b.onclick = () => openBoard(b.dataset.board === "em" ? "em" : st.stTarget === "head" ? "hook" : "motion")));
    if ($("stClear")) $("stClear").onclick = () => {
      snapshot();
      if (st.stScope === "role") delete st.data.style.roles[st.stRole];
      else { const it = selectedOf(T); if (it) { delete it.look; if (T === "cap") ["size", "color", "y", "motion", "enter"].forEach((k) => delete it[k]); if (T === "head") { delete it.enter; delete it.style; } } }
      changed(true);
    };
  }
  // 글자 배경 카드에 넣을 문구: 고른 자막 → 첫 자막 (강조는 그대로)
  function bgSample() {
    const it = find(st.sel);
    const c = st.sel && st.sel.type === "caption" ? it : st.data.captions.slice().sort((a, b) => a.start - b.start)[0];
    const t = c ? String(c.text).split("\n")[0] : "이건 **진짜** 돼요";
    if (t.length <= 11) return t;
    let u = t.slice(0, 11);
    if ((u.match(/\*\*/g) || []).length % 2) u += "**"; // 자른 곳이 강조 안이면 닫아 줌
    return u + "…";
  }
  function fieldHTML(f) {
    const [, k, label, type, opt] = f;
    let h = "";
    if (type === "select") {
      const o = k === "motion" ? Object.fromEntries(Object.entries(S.CAPTION_MOTIONS).filter(([, b]) => st.stTarget === "head" || !b.hookOnly).map(([a, b]) => [a, b.label + (b.hookOnly ? " (훅 전용)" : "")])) : opt;
      h = `<select data-v="${k}">${Object.entries(o).map(([a, b]) => `<option value="${a}">${b}</option>`).join("")}</select>`;
    } else if (type === "number") h = `<input type="number" data-v="${k}" min="${opt[0]}" max="${opt[1]}" step="${opt[2]}">`;
    else if (type === "range") h = `<div class="rng"><input type="range" data-v="${k}" min="${opt[0]}" max="${opt[1]}" step="${opt[2]}"><span data-show="${k}"></span></div>`;
    else if (type === "text") h = `<input type="text" data-v="${k}" placeholder="예: 원장님">`;
    else if (type === "toggle") h = `<label class="chk"><input type="checkbox" data-v="${k}"> 켜기</label>`;
    else if (type === "color") h = `<div class="cf" data-cf="${k}"><input type="color" data-v="${k}"><input type="text" class="hex" data-v="${k}" data-hex="1" maxlength="9"><button class="drop" data-drop="${k}" title="스포이트: 화면에서 색 가져오기">💧</button></div>`;
    if (k === "motion") h = `<div class="cf">${h}<button class="small-btn" data-board="1" title="모션을 눈으로 보고 고르기">🎬 보기</button></div>`;
    if (k === "emMode") h = `<div class="cf">${h}<button class="small-btn" data-board="em" title="강조 방식을 눈으로 보고 고르기">🎬 보기</button></div>`;
    return `<div class="vf" data-row="${k}"><label>${label}</label><div>${h}</div></div>`;
  }
  function bindField(inp) {
    const k = inp.dataset.v;
    const ev = inp.type === "checkbox" || inp.tagName === "SELECT" ? "change" : "input";
    let snapped = false;
    inp.addEventListener("focus", () => { if (inp.type === "color" || inp.dataset.hex) setActiveColor(k); });
    inp.addEventListener(ev, () => {
      let v = inp.type === "checkbox" ? inp.checked : inp.value;
      if (inp.type === "number" || inp.type === "range") { v = parseFloat(v); if (Number.isNaN(v)) return; }
      if (k === "weight") v = Number(v);
      if (inp.dataset.hex) { if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return; }
      if (!snapped) { snapshot(); snapped = true; }
      setVal(k, v);
    });
    inp.addEventListener("blur", () => (snapped = false));
    inp.addEventListener("change", () => (snapped = false));
  }
  // 값 칸을 지금 값으로 맞춤 (입력 중인 칸은 건드리지 않음)
  function syncFields() {
    const sv = scopeValues();
    if (!sv) return;
    $("stFields").querySelectorAll("[data-v]").forEach((inp) => {
      if (inp === document.activeElement && inp.type !== "checkbox") return;
      const v = sv.vals[inp.dataset.v];
      if (inp.type === "checkbox") inp.checked = !!v;
      else if (inp.type === "color") inp.value = String(v || "#000000").slice(0, 7).padEnd(7, "0");
      else inp.value = v ?? "";
    });
    $("stFields").querySelectorAll("[data-show]").forEach((s2) => (s2.textContent = sv.vals[s2.dataset.show]));
    $("stFields").querySelectorAll("[data-row]").forEach((r) => r.classList.toggle("ov", st.stScope !== "all" && r.dataset.row in sv.own));
    $("stFields").querySelectorAll("[data-cf]").forEach((c) => c.classList.toggle("active", c.dataset.cf === st.activeColor));
  }

  // ── 색: 최근 색 · 레퍼런스 색 칩, 스포이트 ──
  function loadRecent() { try { return JSON.parse(localStorage.getItem("sf-recent-colors") || "[]"); } catch (_) { return []; } }
  function rememberColor(c) {
    const hex = String(c).toLowerCase().slice(0, 7);
    const list = [hex, ...loadRecent().filter((x) => x !== hex)].slice(0, 10);
    try { localStorage.setItem("sf-recent-colors", JSON.stringify(list)); } catch (_) {}
    st.recentMem = list;
  }
  function setActiveColor(k) { st.activeColor = k; syncFields(); }
  function refColors() {
    const out = [...(st.refPicked || [])];
    const rs = st.refs && st.refs.refStyle && Array.isArray(st.refs.refStyle.refs) ? st.refs.refStyle.refs : [];
    for (const r of rs) {
      for (const c of r.colors || []) out.push(c);
      for (const [k, v] of Object.entries(r.values || {})) if (/color/i.test(k) && typeof v === "string") out.push(v);
    }
    return [...new Set(out.map((x) => String(x).toLowerCase()))].slice(0, 14);
  }
  function renderChips() {
    const recent = (st.recentMem || loadRecent());
    const refc = refColors();
    const chip = (c, t) => `<button class="chip" data-c="${c}" title="${t} ${c}" style="background:${c}"></button>`;
    const html = (refc.length ? refc.map((c) => chip(c, "레퍼런스 색")).join("") + `<span class="muted small" style="margin:0 2px">|</span>` : "") + recent.map((c) => chip(c, "최근 색")).join("");
    if ($("colorChips").dataset.h === html) return;
    $("colorChips").dataset.h = html;
    $("colorChips").innerHTML = html || `<span class="muted small">색을 쓰면 여기 모여요</span>`;
    $("colorChips").querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => {
      const k = st.activeColor || "color";
      if (!S.TARGET_KEYS[st.stTarget].includes(k)) return toast("색 칸을 먼저 하나 눌러 주세요");
      snapshot();
      setVal(k, b.dataset.c);
      toast(`${k === "color" ? "글자색" : k} ← ${b.dataset.c}`, 1500);
    }));
  }
  // 스포이트: 브라우저가 EyeDropper 를 지원하면 화면 어디서나, 아니면 레퍼런스 · 미리보기 위를 눌러 그 픽셀 색
  async function pickColor(k) {
    setActiveColor(k);
    if (window.EyeDropper) {
      try {
        const r = await new window.EyeDropper().open();
        snapshot(); setVal(k, r.sRGBHex); addPicked(r.sRGBHex);
        return;
      } catch (_) { /* 취소하거나 막히면 아래 방식으로 */ }
    }
    st.picking = k;
    document.body.classList.add("picking");
    toast("왼쪽 레퍼런스(또는 가운데 미리보기)에서 가져올 색을 누르세요 · Esc 취소", 5000);
  }
  function addPicked(hex) { st.refPicked = [hex, ...(st.refPicked || []).filter((x) => x !== hex)].slice(0, 8); renderChips(); }
  function stopPicking() { st.picking = null; document.body.classList.remove("picking"); }
  // 이미지 · 영상의 (화면 좌표) 픽셀 색. fit = contain | cover
  function sampleAt(el, cx, cy, fit) {
    const r = el.getBoundingClientRect();
    const nw = el.naturalWidth || el.videoWidth, nh = el.naturalHeight || el.videoHeight;
    if (!nw || !nh) return null;
    const sc = fit === "cover" ? Math.max(r.width / nw, r.height / nh) : Math.min(r.width / nw, r.height / nh);
    const ox = (r.width - nw * sc) / 2, oy = (r.height - nh * sc) / 2;
    const px = Math.floor((cx - r.left - ox) / sc), py = Math.floor((cy - r.top - oy) / sc);
    if (px < 0 || py < 0 || px >= nw || py >= nh) return null;
    const cv = document.createElement("canvas");
    cv.width = 1; cv.height = 1;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(el, px, py, 1, 1, 0, 0, 1, 1);
    const [R, G, B] = g.getImageData(0, 0, 1, 1).data;
    return "#" + [R, G, B].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  function onPickClick(e, el, fit) {
    // 스포이트 모드이거나 ⌥(Alt)를 누른 채 누르면 색을 가져옴
    if (!st.picking && !e.altKey) return false;
    const hex = sampleAt(el, e.clientX, e.clientY, fit);
    if (!hex) return true;
    const k = st.picking || st.activeColor || "color";
    snapshot(); setVal(k, hex); addPicked(hex);
    toast(`스포이트: ${hex} 를 가져왔어요`, 2000);
    stopPicking();
    e.preventDefault(); e.stopPropagation();
    return true;
  }

  // ── 내 스타일 저장 · 내보내기 ──
  const styleBundle = () => JSON.parse(JSON.stringify({ cap: st.data.style.cap, head: st.data.style.head, bubble: st.data.style.bubble, chapter: st.data.style.chapter, roles: st.data.style.roles }));
  function renderMyStyles() {
    const list = st.data.myStyles || [];
    const sig = JSON.stringify(list.map((m) => m.name + m.savedAt));
    if ($("myStyleList").dataset.sig === sig) return;
    $("myStyleList").dataset.sig = sig;
    $("myStyleList").innerHTML = list.length ? list.map((m, i) => `<div class="ms"><b>${S.esc(m.name)}</b><button class="small-btn" data-ms-load="${i}">불러오기</button><button class="small-btn" data-ms-exp="${i}">파일로</button><button class="small-btn" data-ms-del="${i}">✕</button></div>`).join("")
      : `<div class="muted small">지금 값 묶음(자막 · 훅 · 말풍선 · 챕터 · 역할)을 이름 붙여 저장해요</div>`;
    $("myStyleList").querySelectorAll("[data-ms-load]").forEach((b) => (b.onclick = () => {
      snapshot();
      const m = st.data.myStyles[+b.dataset.msLoad];
      Object.assign(st.data.style, JSON.parse(JSON.stringify(m.style)));
      changed(true);
      toast(`「${S.esc(m.name)}」 스타일을 불러왔어요`);
    }));
    $("myStyleList").querySelectorAll("[data-ms-exp]").forEach((b) => (b.onclick = () => exportStyle(st.data.myStyles[+b.dataset.msExp])));
    $("myStyleList").querySelectorAll("[data-ms-del]").forEach((b) => (b.onclick = () => { snapshot(); st.data.myStyles.splice(+b.dataset.msDel, 1); changed(false); }));
  }
  function saveMyStyle() {
    const name = $("myStyleName").value.trim() || "내 스타일 " + ((st.data.myStyles || []).length + 1);
    snapshot();
    st.data.myStyles = (st.data.myStyles || []).filter((m) => m.name !== name);
    st.data.myStyles.push({ name, savedAt: new Date().toISOString(), style: styleBundle() });
    $("myStyleName").value = "";
    changed(false);
    toast(`「${S.esc(name)}」 저장했어요 (edit.json myStyles)`);
  }
  async function exportStyle(m) {
    const r = await fetch("/api/export-style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: m.name, savedAt: m.savedAt, style: m.style }) }).then((x) => x.json());
    toast(r.ok ? `파일로 저장했어요: ${S.esc(r.file)}<br>저장소 규칙/ 폴더에 넣어 두면 다음 영상에도 써요` : "내보내지 못했어요", 6000);
  }

  // ── 레퍼런스 나란히 보기 · 대조표 ──
  async function loadRefs() {
    st.refs = await fetch("/api/refs").then((x) => x.json()).catch(() => ({ files: [], refStyle: null, reference: null }));
    const rs = st.refs.refStyle && Array.isArray(st.refs.refStyle.refs) ? st.refs.refStyle.refs : [];
    const used = new Set(rs.flatMap((r) => [r.src, ...(r.frames || [])]));
    st.refItems = [...rs.map((r) => Object.assign({ card: true }, r)), ...st.refs.files.filter((f) => !used.has(f)).map((f) => ({ id: f, name: f.split("/").pop(), src: f }))];
    st.refIdx = Math.min(st.refIdx || 0, Math.max(0, st.refItems.length - 1));
    st.refFrame = -1;
    renderRefs();
    renderReferenceMd(st.refs.reference);
    renderChips();
  }
  const isVid = (p) => /\.(mp4|mov|webm)$/i.test(p || "");
  function renderRefs() {
    const items = st.refItems || [];
    $("refList").innerHTML = items.map((r, i) => `<button data-ri="${i}" class="${i === st.refIdx ? "on" : ""}">${S.esc(r.name || r.id)}${r.card ? " ★" : ""}</button>`).join("");
    $("refList").querySelectorAll("[data-ri]").forEach((b) => (b.onclick = () => { st.refIdx = +b.dataset.ri; st.refFrame = -1; renderRefs(); }));
    const r = items[st.refIdx];
    if (!r) { $("refView").innerHTML = `<div class="muted small">편집 폴더 refs/ 에 레퍼런스 영상 · 이미지를 넣으면 여기 나란히 보여요</div>`; renderRefTable(); return; }
    const frames = r.frames || [];
    const showFrame = st.refFrame >= 0 && frames[st.refFrame];
    const src = showFrame ? frames[st.refFrame] : r.src || frames[0];
    const media = isVid(src) ? `<video id="refMedia" src="/project/${src}" playsinline preload="auto" controls muted></video>` : `<img id="refMedia" src="/project/${src}" alt="레퍼런스">`;
    const nav = (frames.length ? `<button data-fr="-1" class="${st.refFrame < 0 ? "on" : ""}">${isVid(r.src) ? "영상" : "원본"}</button>` + frames.map((_, i) => `<button data-fr="${i}" class="${i === st.refFrame ? "on" : ""}">${i + 1}</button>`).join("") : "") +
      (frames.length > 1 ? `<button data-step="-1">◀</button><button data-step="1">▶</button>` : "");
    $("refView").innerHTML = media + (nav ? `<div class="nav">${nav}</div>` : "");
    $("refNote").innerHTML = [r.motionNote ? "모션: " + S.esc(r.motionNote) : "", r.note ? S.esc(r.note) : ""].filter(Boolean).join("<br>");
    $("refView").querySelectorAll("[data-fr]").forEach((b) => (b.onclick = () => { st.refFrame = +b.dataset.fr; renderRefs(); }));
    $("refView").querySelectorAll("[data-step]").forEach((b) => (b.onclick = () => { st.refFrame = ((st.refFrame < 0 ? 0 : st.refFrame) + +b.dataset.step + frames.length) % frames.length; renderRefs(); }));
    const m = $("refMedia");
    m.addEventListener("click", (e) => onPickClick(e, m, "contain"), true);
    renderRefTable();
  }
  // 대조표 줄: [키, 이름, 값 키들]
  const CMP_ROWS = [
    ["font", "글꼴 느낌", ["font", "weight"]], ["size", "크기", ["size"]], ["color", "글자색", ["color"]],
    ["box", "상자", ["boxOn", "boxColor", "boxOpacity", "radius"]], ["stroke", "외곽선", ["strokeColor", "strokeWidth"]],
    ["pos", "위치", ["y", "align"]], ["em", "강조", ["emMode", "emColor"]], ["motion", "모션", ["motion", "speed"]],
  ];
  const CHECKS = { match: "맞음", closer: "더 가깝게", different: "일부러 다르게" };
  function fmtVal(k, v) {
    if (v == null || v === "") return "—";
    if (/color/i.test(k)) return `<span class="sw" style="background:${S.esc(v)}"></span>${S.esc(v)}`;
    if (k === "font") return S.esc(S.FONT_OPTIONS[v] || v);
    if (k === "boxOn") return v ? "상자 있음" : "상자 없음";
    if (k === "motion") return S.esc(S.CAPTION_MOTIONS[v]?.label || v);
    if (k === "emMode") return S.esc(S.EM_MODES[v] || v);
    if (k === "speed") return S.esc(S.SPEEDS[v] || v);
    if (k === "align") return S.esc(S.ALIGNS[v] || v);
    if (k === "boxOpacity") return "진하기 " + v;
    if (k === "radius") return "둥글기 " + v;
    if (k === "strokeWidth") return v + "px";
    if (k === "weight") return "굵기 " + v;
    if (k === "y") return "y " + v;
    return S.esc(String(v));
  }
  function renderRefTable() {
    const r = (st.refItems || [])[st.refIdx];
    const box = $("refTable");
    if (!r || !r.values) {
      box.innerHTML = st.refs && st.refs.refStyle && st.refs.refStyle.error ? `<div class="muted small">${S.esc(st.refs.refStyle.error)}</div>` : `<div class="muted small">이 레퍼런스엔 뽑은 값(refs/ref-style.json)이 없어요. Claude에게 「레퍼런스 값 뽑아 줘」라고 하면 만들어요</div>`;
      return;
    }
    const cur = Object.assign({}, S.BASE.cap, st.data.style.cap);
    const chk = ((st.data.refCheck || {})[r.id] || {});
    box.innerHTML = `<div class="btns" style="margin-bottom:6px"><button id="refApplyAll" class="accent small-btn">이 값으로 적용 (지금 「${TARGETS[st.stTarget]} · ${SCOPES[st.stTarget][st.stScope] || ""}」)</button></div>` +
      `<table><tr><th>항목</th><th>레퍼런스</th><th>지금 (전체 자막)</th><th>확인</th></tr>` +
      CMP_ROWS.map(([rk, label, keys]) => {
        const has = keys.some((k) => r.values[k] != null);
        if (!has) return "";
        return `<tr><td><b>${label}</b></td><td>${keys.filter((k) => r.values[k] != null).map((k) => fmtVal(k, r.values[k])).join("<br>")}</td><td>${keys.map((k) => fmtVal(k, cur[k])).join("<br>")}</td>` +
          `<td><div class="ck">${Object.entries(CHECKS).map(([ck, cl]) => `<label><input type="radio" name="rc-${rk}" data-rc="${rk}" value="${ck}"${chk[rk] === ck ? " checked" : ""}> <span>${cl}</span></label>`).join("")}` +
          `<button class="apply" data-rapply="${rk}">→ 적용</button></div></td></tr>`;
      }).join("") + `</table>`;
    $("refApplyAll").onclick = () => { snapshot(); setVals(r.values); changed(true); toast("레퍼런스 값을 적용했어요. 다른 점은 대조표에서 「일부러 다르게」로 표시해 두세요"); };
    box.querySelectorAll("[data-rapply]").forEach((b) => (b.onclick = () => {
      const keys = CMP_ROWS.find((x) => x[0] === b.dataset.rapply)[2];
      snapshot();
      setVals(Object.fromEntries(keys.filter((k) => r.values[k] != null).map((k) => [k, r.values[k]])));
      changed(true);
    }));
    box.querySelectorAll("[data-rc]").forEach((inp) => (inp.onchange = () => {
      snapshot();
      st.data.refCheck = st.data.refCheck || {};
      st.data.refCheck[r.id] = Object.assign({}, st.data.refCheck[r.id], { [inp.dataset.rc]: inp.value, updatedAt: new Date().toISOString() });
      changed(false);
    }));
  }
  // 같이 재생: 내 미리보기 재생 · 멈춤 · 이동을 레퍼런스 영상이 따라감
  function syncRef(t) {
    const m = $("refMedia");
    if (!m || m.tagName !== "VIDEO" || !$("refSync").checked || !m.duration) return;
    const want = Math.min(t, m.duration - 0.05);
    if (Math.abs(m.currentTime - want) > (st.playing ? 0.3 : 0.04)) m.currentTime = want;
    if (st.playing && m.paused) m.play().catch(() => {});
    if (!st.playing && !m.paused) m.pause();
  }
  function renderReferenceMd(r) {
    const box = $("refBox");
    if (!r || (!r.chosen && !(r.takeaways || []).length)) { box.innerHTML = `<div class="muted small">REFERENCE.md 가 아직 없어요</div>`; return; }
    box.innerHTML = `<div class="chosen">${S.esc(r.chosen || "")}</div>` + (r.link ? `<a href="${r.link}" target="_blank">${r.link}</a>` : "") +
      `<h3>가져온 것</h3>` + (r.takeaways || []).map((t) => `<div class="take"><b>${S.esc(t.time)}</b><div>${S.esc(t.observed)}</div><div class="apply">→ ${S.esc(t.apply)}</div></div>`).join("") +
      ((r.notTake || []).length ? `<h3>가져오지 않은 것</h3><ul>${r.notTake.map((x) => `<li>${S.esc(x)}</li>`).join("")}</ul>` : "");
  }

  // 지금 자막(없으면 다음 자막)을 처음부터 1.5초 보여 줌
  function previewCaption() {
    const cs = st.data.captions.slice().sort((a, b) => a.start - b.start);
    const c = cs.find((x) => st.t >= x.start && st.t < x.end) || cs.find((x) => x.start >= st.t) || cs[0];
    if (!c) return;
    seek(Math.max(0, c.start - 0.05));
    st.stopAt = Math.min(c.end, c.start + 1.6);
    st.onStop = () => {};
    setPlaying(true);
  }

  // ── 훅 탭 ──
  function renderHookBar() {
    const bar = $("hookBar");
    const hs = st.data.hooks || [];
    const pk = S.pickedHook(viewData());
    if (!hs.length) {
      bar.innerHTML = `<span class="muted small">첫 3초 훅이 아직 없어요</span><button id="hkMake" class="accent">＋ 훅 3개 만들기</button>`;
      $("hkMake").onclick = makeHooks;
      return;
    }
    bar.innerHTML = hs.map((h, i) => `<button class="hk${pk === h ? " on" : ""}" data-h="${S.esc(h.id)}" title="${S.esc(h.text || "")}">${S.esc(hookName(h, i))}<small>${S.esc(String(h.text || "").replace(/\*\*/g, "").split("\n")[0].slice(0, 10))}</small></button>`).join("") +
      `<button class="seq" id="hkSeq" title="훅들의 첫 3초를 차례로 재생">▶ 훅 ${hs.length}개 차례로 보기</button>` +
      (hs.length < 3 ? `<button id="hkAdd">＋ 훅</button>` : "");
    bar.querySelectorAll("[data-h]").forEach((b) => (b.onclick = () => { pickHook(b.dataset.h, true); playHook(b.dataset.h); }));
    $("hkSeq").onclick = playAllHooks;
    if ($("hkAdd")) $("hkAdd").onclick = () => { snapshot(); st.data.hooks.push(newHook(st.data.hooks.length)); changed(true); };
  }
  function newHook(i) {
    const first = st.data.captions.slice().sort((a, b) => a.start - b.start)[0];
    return { id: "hook" + "ABCDEFG"[i], label: "훅 " + "ABCDEFG"[i], text: i === 0 && first ? String(first.text).replace(/\*\*/g, "") : "첫 줄\n**강조** 둘째 줄", enter: ["slam", "words", "pop"][i % 3], end: 3 };
  }
  function makeHooks() {
    snapshot();
    st.data.hooks = [0, 1, 2].map(newHook);
    st.data.hookPick = st.data.hooks[0].id;
    st.sel = { type: "hook", id: st.data.hooks[0].id };
    changed(true);
    toast("훅 3개를 만들었어요. 오른쪽 「선택한 것」에서 글자를 고쳐 주세요");
  }
  function pickHook(id, save) {
    if (save && st.data.hookPick !== id) { snapshot(); st.data.hookPick = id; }
    st.viewHook = null;
    st.sel = { type: "hook", id };
    changed(true);
  }
  function playHook(id) {
    const h = (st.data.hooks || []).find((x) => x.id === id);
    if (!h) return;
    setPlaying(false);
    seek(0);
    st.stopAt = (h.end || 3) + 0.3;
    st.onStop = () => {};
    setPlaying(true);
  }
  // 훅들을 차례로: 저장된 고른 훅은 그대로 두고 잠깐씩 바꿔 보여 줌
  function playAllHooks() {
    const hs = st.data.hooks.slice();
    let i = 0;
    const label = document.createElement("div");
    label.className = "hk-label";
    $("stage").appendChild(label);
    const next = () => {
      if (i >= hs.length) {
        st.viewHook = null;
        label.remove();
        renderStage(); renderTimeline();
        seek(0);
        toast("다 봤어요. 마음에 드는 훅 탭을 누르면 그 훅으로 정해져요");
        return;
      }
      const h = hs[i];
      st.viewHook = h.id;
      label.textContent = hookName(h, i);
      i++;
      renderStage(); renderTimeline();
      seek(0);
      st.stopAt = (h.end || 3) + 0.2;
      st.onStop = () => setTimeout(next, 350);
      setPlaying(true);
    };
    setPlaying(false);
    next();
  }

  // ── 효과 미리보기 (저장하지 않고 재생 위치에서 한 번 보여 줌) ──
  function previewEffect(type) {
    const len = S.EFFECTS[type].len || 1;
    const t0 = Math.max(0, Math.min(st.t, (st.data.duration || len) - len));
    const cur = find(st.sel);
    const anchor = st.sel && (st.sel.type === "effect" || st.sel.type === "camera") && cur ? { ax: cur.ax ?? 540, ay: cur.ay ?? 800 } : { ax: 540, ay: 800 };
    setPlaying(false);
    st.previewFx = Object.assign({ id: "preview", type, start: r2(t0), end: r2(t0 + len), strength: 1 }, anchor);
    renderStage();
    seek(Math.max(0, t0 - 0.3));
    st.stopAt = t0 + len + 0.3;
    st.onStop = () => { st.previewFx = null; renderStage(); seek(t0); };
    setPlaying(true);
    toast(`미리보기: ${S.EFFECTS[type].label} (넣으려면 이름을 누르세요)`, 2000);
  }

  // ── 모션 고르기 보드: 내 자막 문구로 카드마다 반복 재생 (렌더와 같은 scene.js 코드) ──
  const TPL_DESC = {
    bigNumber: ["숫자가 굴러 올라가 멈춤 + 단위 + 한 줄", "기간 · 횟수 · 나이 (말한 숫자만)", "얼마나 됐나요"],
    compare: ["왼쪽 · 오른쪽 두 칸 사실 비교", "「처음 → 지금」 같은 사실 (전후 비교 금지)", "간격이 이렇게 바뀌었어요"],
    checklist: ["항목마다 체크가 그려짐", "생활 수칙 · 준비물 · 단계", "이것만 지켜요"],
    calendar: ["날짜에 동그라미가 차례로 + 간격", "약 먹은 날 · 증상 난 날", "두드러기 난 날"],
    route: ["점-선-점 · 탈것이 선을 따라감", "「인천 → 부산」 이동 이야기", "여기서 왔어요"],
    quote: ["큰 따옴표 + 그대로 한 말 + 출처", "환자 · 손님이 한 말 (사실 그대로)", ""],
    timeline: ["구간 막대가 차례로 자람", "「8개월」 「석 달」 같은 기간", "지나온 시간"],
  };
  // 지금 고른 시각 자료 (그림판 패널 · 대화 · 장면 컷)
  function currentVisual() {
    const it = find(st.sel);
    if (!it || !st.sel) return null;
    if (st.sel.type === "panel") return { type: "panel", it };
    if (st.sel.type === "overlay" && (it.kind === "chat" || it.kind === "insert")) return { type: "overlay", it };
    return null;
  }
  const BOARD_TABS = { motion: `자막 모션 ${Object.values(S.CAPTION_MOTIONS).filter((m) => !m.hookOnly).length}`, look: `글자 모양 ${Object.values(S.STYLE_PRESETS).filter((p) => !p.old).length}`, em: `강조 방식 ${Object.keys(S.EM_MODES).length}`, fx: `줌 · 카메라 ${Object.keys(S.EFFECTS).length}`, hook: "훅 등장 모션", trans: "화면 전환", canvas: "그림판", vlayout: "레이아웃" };
  const bd = { tab: "motion", speed: "normal", group: "전체", lgroup: "전체", cards: [], still: "", raf: 0 };
  // 글자 배경 · 스타일 고르기 카드 = scene.js 의 셀피쉬 스타일 10개 (누르면 모양 값을 한 번에, 모션 · 위치는 그대로)
  const KEEP_KEYS = ["motion", "speed", "delay", "y", "align"];

  const CROP_H = 820; // 카드에 보여 줄 세로 구간(px). 카드 비율 1080:820
  function boardStill() {
    // 지금 영상 프레임을 스틸로 (같은 서버 파일이라 캔버스로 읽힘)
    const v = $("sfroot").querySelector("#footage");
    if (!v || v.readyState < 2) return "";
    try {
      const cv = document.createElement("canvas");
      cv.width = 540; cv.height = 960;
      cv.getContext("2d").drawImage(v, 0, 0, 540, 960);
      return cv.toDataURL("image/jpeg", 0.75);
    } catch (_) { return ""; }
  }
  function boardText() {
    const cs = st.data.captions.slice().sort((a, b) => a.start - b.start);
    const it = find(st.sel);
    let c = st.sel && st.sel.type === "caption" ? it : null;
    if (!c && st.stScope === "role") c = cs.find((x) => x.role === st.stRole);
    if (!c) c = cs.find((x) => x.start >= st.t) || cs[0];
    let t = c ? String(c.text) : "이건 **진짜** 돼요";
    if (!/\*\*/.test(t)) {
      // 강조가 없으면 가장 긴 낱말을 강조로 (강조 · 형광펜 카드가 보이게)
      const w = t.split(/\s+/).sort((a, b) => b.length - a.length)[0];
      if (w) t = t.replace(w, "**" + w + "**");
    }
    return t;
  }
  function openBoard(tab) {
    setPlaying(false);
    if (tab) bd.tab = tab;
    if (bd.tab === "hook") st.stTarget = "head"; else st.stTarget = "cap";
    bd.still = boardStill();
    $("board").classList.remove("hidden");
    renderBoard();
  }
  function closeBoard() {
    $("board").classList.add("hidden");
    cancelAnimationFrame(bd.raf);
    bd.cards = [];
    $("bdGrid").innerHTML = "";
    if (st.stTarget === "head" && bd.tab === "hook") renderStylePanel();
  }
  function boardHead() {
    const T = bd.tab === "hook" ? "head" : "cap";
    st.stTarget = T;
    if (!SCOPES[T][st.stScope]) st.stScope = "all";
    $("bdTabs").innerHTML = Object.entries(BOARD_TABS).map(([k, v]) => `<button data-bt="${k}" class="${k === bd.tab ? "on" : ""}">${v}</button>`).join("");
    $("bdScope").innerHTML = bd.tab === "fx" ? `<span class="muted small">재생 위치(${fmt(st.t)}초)에 넣어요</span>` : Object.entries(SCOPES[T]).map(([k, v]) => `<button data-bs="${k}" class="${k === st.stScope ? "on" : ""}">${v}</button>`).join("");
    $("bdRole").classList.toggle("hidden", !(T === "cap" && st.stScope === "role" && bd.tab !== "fx"));
    $("bdRole").innerHTML = Object.entries(S.ROLES).map(([k, v]) => `<option value="${k}"${k === st.stRole ? " selected" : ""}>${v} 역할</option>`).join("");
    $("bdSpeed").innerHTML = Object.entries(S.SPEEDS).map(([k, v]) => `<button data-sp="${k}" class="${k === bd.speed ? "on" : ""}">${v}</button>`).join("") +
      "";
    $("bdTabs").querySelectorAll("[data-bt]").forEach((b) => (b.onclick = () => { bd.tab = b.dataset.bt; renderBoard(); }));
    $("bdScope").querySelectorAll("[data-bs]").forEach((b) => (b.onclick = () => { st.stScope = b.dataset.bs; renderBoard(); }));
    $("bdSpeed").querySelectorAll("[data-sp]").forEach((b) => (b.onclick = () => { bd.speed = b.dataset.sp; renderBoard(); }));
    // 느낌별 묶음 필터 (모션 · 훅: 기본 · 통통 귀여움 · 강렬 예능 · 감성 · 정보 · 숫자 / 글자 모양: 블록 · 스티커 · …)
    const grpList = bd.tab === "look" ? S.LOOK_GROUPS : bd.tab === "motion" || bd.tab === "hook" ? S.MOTION_GROUPS : null;
    const cur = bd.tab === "look" ? bd.lgroup : bd.group;
    $("bdInfo").insertAdjacentHTML("beforebegin", "");
    let gb = $("bdGroups");
    if (!gb) { gb = document.createElement("div"); gb.id = "bdGroups"; gb.className = "bd-groups"; $("bdInfo").before(gb); }
    gb.innerHTML = grpList ? `<span class="muted small">느낌</span>` + ["전체", ...grpList].map((g) => `<button data-grp="${g}" class="${g === cur ? "on" : ""}">${g}</button>`).join("") : "";
    gb.querySelectorAll("[data-grp]").forEach((b) => (b.onclick = () => { if (bd.tab === "look") bd.lgroup = b.dataset.grp; else bd.group = b.dataset.grp; renderBoard(); }));
    const sv = scopeValues();
    const where = st.stScope === "role" ? `「${S.ROLES[st.stRole]}」 역할 자막` : st.stScope === "sel" ? (T === "head" ? "고른 훅" : "고른 자막 하나") : T === "head" ? "모든 훅" : "모든 자막";
    $("bdInfo").innerHTML = bd.tab === "fx" ? "카드를 누르면 지금 재생 위치에 그 효과가 들어가요 (노란 동그라미로 중심, 타임라인에서 길이)"
      : bd.tab === "vlayout" ? (currentVisual() ? "고른 시각 자료를 레이아웃마다 보여 줘요. 카드를 누르면 그 레이아웃으로 바뀌어요 (자막은 얼굴을 피해 자동으로 옮겨져요)" : "그림판 · 대화 화면 · 장면 컷 하나를 고르면 그 자료로 보여 줘요 (지금은 보기 자료)")
      : bd.tab === "canvas" ? "고른 그림판이 있으면 그 템플릿 · 테마로 바뀌고, 없으면 재생 위치에 새 그림판이 들어가요 (숫자 · 말은 영상에서 말한 것만)"
      : bd.tab === "trans" ? "장면 컷이나 그림판을 고르면 그 「들어올 때」로 들어가요"
      : bd.tab === "look" && sv ? `카드를 누르면 <b>${where}</b>의 글자 모양(글꼴 · 배경 · 색 · 꾸밈)이 바뀌어요. 모션은 지금 것(${S.esc(S.CAPTION_MOTIONS[sv.vals.motion]?.label || "")}) 그대로`
      : !sv ? "자막을 하나 고른 뒤 다시 열어 주세요 (지금은 「선택한 자막만」인데 고른 자막이 없어요)"
      : `카드를 누르면 <b>${where}</b>에 바로 적용돼요 · 미리보기 문구: 「${S.esc(boardText().replace(/\*\*/g, ""))}」`;
  }
  // 카드 하나: 작은 무대에 renderBody → pageCSS → buildTimeline (렌더와 같은 코드)
  function makeCard(i, data, L) {
    const id = "bdc" + i;
    const host = document.createElement("div");
    host.className = "bd-stage";
    host.id = id;
    host.innerHTML = `<style>${S.pageCSS(data, "/comp/", "#" + id)}</style>` + S.renderBody(data, { base: "/comp/" });
    host.querySelectorAll("video.sf-ins").forEach((iv) => { const im = document.createElement("img"); im.id = iv.id; im.className = iv.className; im.setAttribute("style", iv.getAttribute("style") + ";object-fit:cover;filter:hue-rotate(160deg) saturate(.6)"); im.src = bd.still || ""; for (const k of ["start", "duration"]) im.dataset[k] = iv.dataset[k]; iv.replaceWith(im); });
    const v = host.querySelector("video#footage");
    if (v) {
      const img = document.createElement("img");
      img.id = "footage";
      img.src = bd.still || "";
      img.style.cssText = "position:absolute;left:0;top:0;width:1080px;height:1920px;object-fit:cover";
      v.replaceWith(img);
    }
    // 배경 프레임 위에 검정 덮개(40%) — 글자 · 모션이 잘 보이게 (카드 표시에만)
    const lay = host.querySelector("#sf-lay");
    if (lay) lay.insertAdjacentHTML("beforeend", `<div style="position:absolute;inset:0;width:1080px;height:1920px;background:rgba(0,0,0,.4)"></div>`);
    const tl2 = gsap.timeline({ paused: true });
    S.buildTimeline(gsap, tl2, data, host);
    return { host, tl: tl2, L, t0: performance.now() + i * 90, focusY: data.__focusY ?? 960 };
  }
  function renderBoard() {
    cancelAnimationFrame(bd.raf);
    boardHead();
    const grid = $("bdGrid");
    grid.innerHTML = "";
    bd.cards = [];
    const sv = scopeValues() || { vals: Object.assign({}, S.BASE.cap, st.data.style.cap) };
    const k = { fast: 0.6, normal: 1, slow: 1.6 }[bd.speed];
    const text = boardText();
    const capY = (sv.vals.y ?? 1300) + 90;
    // 카드마다 한 줄: 그 사람의 지금 글자 배경 · 색 설정 그대로
    const caps = (look, start, end) => [{ id: "c", start, end, text, look: Object.assign({}, sv.vals, look) }];
    const mk = (extra) => S.defaults(Object.assign({ duration: 6, source: "", captions: [], overlays: [], effects: [], camera: [], sfx: [], hooks: [], style: JSON.parse(JSON.stringify(st.data.style)) }, extra));
    let items = [];
    const inGroup = (info) => bd.group === "전체" || info.group === bd.group;
    const numText = () => {
      const c = st.data.captions.find((x) => x.role === "number" && /\d/.test(x.text)) || st.data.captions.find((x) => /\d/.test(x.text));
      return c ? String(c.text) : "딱 **3단계**면 끝나요";
    };
    if (bd.tab === "motion") {
      const L = 2.4 * k + 0.8;
      items = Object.entries(S.CAPTION_MOTIONS).filter(([, info]) => !info.hookOnly && inGroup(info)).map(([m, info]) => ({ key: m, name: info.label, desc: info.desc, fit: info.fit, L, group: info.group,
        on: sv.vals.motion === m, data: mk({ __focusY: capY, captions: [{ id: "c", start: 0.25, end: L - 0.15, text: m === "numberRoll" && !/\d/.test(text) ? numText() : text, look: Object.assign({}, sv.vals, { motion: m, speed: bd.speed, delay: 0 }) }] }) }));
    } else if (bd.tab === "trans") {
      // 화면 전환: 다음 장면(글자 카드)이 그 전환으로 들어옴
      const L = 2.4;
      const keys = ["cut", "fade", "slide", "pop", "colorWipe", "lightLeak"];
      items = keys.map((t) => ({ key: t, name: (S.PANEL_TRANS[t] || S.INSERT_TRANS[t] || t).replace(/ \(.*\)/, ""), desc: S.TRANS_INFO[t].desc, fit: S.TRANS_INFO[t].fit, L,
        data: mk({ __focusY: 960, layout: "card", panels: [{ id: "p", start: 0.7, end: L - 0.05, title: "다음 **장면**", text: "", bg: "#1f3b2d", color: "#ffffff", enter: t, exit: "cut" }] }) }));
    } else if (bd.tab === "canvas") {
      // 그림판 템플릿 7 + 대화 화면 3테마 (전체 화면 카드로 크게)
      const L = 3.6;
      items = Object.entries(S.TEMPLATES).filter(([k]) => k !== "none" && k !== "chat").map(([k, lab]) => ({ key: "tpl:" + k, name: lab, desc: TPL_DESC[k][0], fit: TPL_DESC[k][1], L, full: 1,
        data: mk({ panels: [{ id: "p", start: 0.05, end: L, layout: "full", tpl: k, title: TPL_DESC[k][2] }] }) }));
      for (const [tk, th] of Object.entries(S.CHAT_THEMES)) {
        const L2 = 4.6;
        items.push({ key: "chat:" + tk, name: "대화 화면 · " + th.label, desc: "실제 메신저처럼 메시지가 차례로 · 입력 중 점 · 안 읽음 1", fit: "환자 · 손님 질문 · 상담 장면", L: L2, full: 1,
          data: mk({ panels: [{ id: "p", start: 0.05, end: L2, layout: "full", tpl: "chat", messages: SAMPLE_MSGS, theme: tk, frame: true, bubbleAnim: "typing", gap: 0.8 }] }) });
      }
    } else if (bd.tab === "vlayout") {
      // 지금 고른 시각 자료를 5가지 레이아웃으로 (화면 속 화면은 4곳)
      const L = 3.4;
      const cur = currentVisual();
      const base0 = cur ? JSON.parse(JSON.stringify(cur.it)) : { id: "p", tpl: "quote", title: "", tplData: { text: "약 먹은 날짜를 세고 있어요", source: "환자분" } };
      const capT = st.data.captions[0] ? String(st.data.captions[0].text) : "자막은 얼굴을 피해 자리를 옮겨요";
      const keys = [["full"], ["splitTop"], ["splitBottom"], ["pip", "tr"], ["pip", "tl"], ["pip", "br"], ["pip", "bl"], ["float"]];
      items = keys.map(([lk, pos]) => {
        const v = Object.assign({}, base0, { id: "v", start: 0.05, end: L, layout: lk, pipPos: pos });
        const isOv = cur && cur.type === "overlay";
        return { key: lk + (pos ? ":" + pos : ""), name: S.VIS_LAYOUTS[lk].label + (pos ? " · " + S.PIP_POS[pos] : ""), desc: S.VIS_LAYOUTS[lk].desc, fit: cur ? "고른 자료로 보기" : "보기 자료 (하나를 고르면 그걸로)", L, full: 1,
          on: cur && (cur.it.layout || "") === lk && (lk !== "pip" || (cur.it.pipPos || "tr") === pos),
          data: mk({ captions: [{ id: "c", start: 0.05, end: L, text: capT }], panels: isOv ? [] : [v], overlays: isOv ? [v] : [] }) };
      });
    } else if (bd.tab === "look") {
      const L = 2.6;
      items = Object.entries(S.STYLE_PRESETS).filter(([, p]) => !p.old && (bd.lgroup === "전체" || p.group === bd.lgroup)).map(([pk, p]) => {
        const look = Object.assign({}, S.BASE.cap, p.cap, { motion: sv.vals.motion === "none" ? "pop" : sv.vals.motion, speed: sv.vals.speed, delay: 0, y: sv.vals.y });
        const on = ["font", "boxOn", "boxColor", "color", "fx", "emMode", "nametag"].every((x) => String(sv.vals[x] ?? "") === String(Object.assign({}, S.BASE.cap, p.cap)[x] ?? ""));
        return { key: pk, name: p.label, desc: p.desc, fit: p.group, L, on, data: mk({ __focusY: capY, captions: [{ id: "c", start: 0.2, end: L, text, look }] }) };
      });
    } else if (bd.tab === "em") {
      const L = 2.4;
      items = Object.entries(S.EM_MODES).map(([m, label]) => ({ key: m, name: label, desc: S.EM_INFO[m].desc, fit: S.EM_INFO[m].fit, L,
        on: sv.vals.emMode === m, data: mk({ __focusY: capY, captions: caps({ emMode: m, motion: m === "marker" ? "marker" : "emphasis", speed: bd.speed, delay: 0 }, 0.1, L) }) }));
    } else if (bd.tab === "fx") {
      items = Object.entries(S.EFFECTS).map(([m, info]) => {
        const len = info.len * k;
        const L = len + 1.1;
        return { key: m, name: info.label, desc: info.desc, fit: S.EFFECT_FIT[m] || "", L,
          data: mk({ __focusY: 960, effects: [{ id: "e", type: m, start: 0.4, end: 0.4 + len, strength: 1, ax: 540, ay: 800 }], captions: [{ id: "c", start: 0, end: L, text, look: Object.assign({}, sv.vals, { motion: "none" }) }] }) };
      });
    } else {
      const h0 = S.pickedHook(st.data);
      const ht = (h0 && h0.text) || "첫 줄\n**강조** 둘째 줄";
      const L = 2.6 * k + 0.6;
      const hv = sv.vals;
      items = Object.entries(S.CAPTION_MOTIONS).filter(([m, info]) => m !== "none" && inGroup(info)).map(([m, info]) => ({ key: m, name: info.label, desc: info.desc, fit: info.fit, L,
        on: hv.motion === m, data: mk({ __focusY: (hv.y ?? 420) + 60, hooks: [{ id: "h", text: ht, end: L - 0.1, look: Object.assign({}, hv, { motion: m, speed: bd.speed, delay: 0 }) }], hookPick: "h" }) }));
    }
    items.forEach((it, i) => {
      const card = document.createElement("button");
      card.className = "bd-card" + (it.on ? " on" : "");
      card.dataset.key = it.key;
      card.innerHTML = `<div class="bd-frame"></div>${it.on ? `<span class="badge">✓ ${bd.tab === "fx" ? "" : "지금 적용됨"}</span>` : ""}<b>${S.esc(it.name)}</b><span class="d">${S.esc(it.desc || "")}</span><span class="f">${bd.tab === "look" ? "묶음: " : "어울리는 곳: "}${S.esc(it.fit || "")}</span>`;
      const c = makeCard(i, it.data, it.L);
      if (it.full) c.full = true;
      const fr = card.querySelector(".bd-frame");
      if (it.full) fr.classList.add("full");
      fr.appendChild(c.host);
      card.onclick = () => applyBoard(it.key);
      grid.appendChild(card);
      bd.cards.push(c);
    });
    // 카드 크기에 맞춰 무대 축소
    // 카드 무대: 자막이 있는 세로 구간(CROP_H)만 잘라 크게 보여 줌
    requestAnimationFrame(() => bd.cards.forEach((c) => {
      const w = c.host.parentElement.clientWidth, sc = w / 1080;
      const top = c.full ? 0 : Math.max(0, Math.min(1920 - CROP_H, c.focusY - CROP_H / 2));
      c.host.style.transform = `translateY(${-top * sc}px) scale(${sc})`;
    }));
    const tick = (now) => {
      for (const c of bd.cards) {
        const t = (((now - c.t0) / 1000) % c.L + c.L) % c.L;
        c.tl.seek(t, false);
        c.host.querySelectorAll("[data-start]").forEach((el) => {
          if (el.id === "footage") return;
          const s0 = +el.dataset.start, d0 = +el.dataset.duration;
          el.style.visibility = t >= s0 && t < s0 + d0 ? "visible" : "hidden";
        });
      }
      bd.raf = requestAnimationFrame(tick);
    };
    bd.raf = requestAnimationFrame(tick);
  }
  function applyBoard(key) {
    if (bd.tab === "fx") { addEffect(key); toast(`${S.EFFECTS[key].label}을 ${fmt(st.t)}초에 넣었어요`); return; }
    if (bd.tab === "trans") {
      const it = find(st.sel);
      const ok = it && ((st.sel.type === "overlay" && it.kind === "insert" && S.INSERT_TRANS[key]) || (st.sel.type === "panel" && S.PANEL_TRANS[key]));
      if (!ok) return toast("장면 컷(insert)이나 반반 컷 패널을 먼저 고르면 그 「들어올 때」로 들어가요");
      snapshot(); it.enter = key; changed(true);
      return toast(`들어올 때: ${S.esc(S.PANEL_TRANS[key] || S.INSERT_TRANS[key])}`);
    }
    if (bd.tab === "vlayout") {
      const cur = currentVisual();
      if (!cur) return toast("그림판 · 대화 화면 · 장면 컷 하나를 먼저 고르면 그 자료에 레이아웃이 들어가요");
      const [lk, pos] = key.split(":");
      snapshot(); cur.it.layout = lk; if (pos) cur.it.pipPos = pos; changed(true);
      return renderBoard();
    }
    if (bd.tab === "canvas") {
      const [kind, k] = key.split(":");
      const it = find(st.sel);
      snapshot();
      if (kind === "chat") {
        if (it && st.sel.type === "overlay" && it.kind === "chat") { it.theme = k; changed(true); return toast(`대화 화면 테마: ${S.esc(S.CHAT_THEMES[k].label)}`); }
        if (it && st.sel.type === "panel") { it.tpl = "chat"; it.theme = k; if (!(it.messages && it.messages.length)) it.messages = JSON.parse(JSON.stringify(SAMPLE_MSGS)); changed(true); return toast("그림판을 대화 화면으로 바꿨어요"); }
      } else if (it && st.sel.type === "panel") { it.tpl = k; changed(true); return toast(`템플릿: ${S.esc(S.TEMPLATES[k])} — 오른쪽 「선택한 것」에서 글 · 숫자를 고치세요 (말한 것만)`); }
      // 고른 게 없으면 재생 위치에 새 그림판 (반반 · 위 자료)
      const D = st.data.duration || 10, s0 = Math.max(0, Math.min(st.t, D - 3.5));
      const p = { id: uid("pn"), start: r2(s0), end: r2(Math.min(D, s0 + 3.5)), layout: "splitTop", tpl: kind === "chat" ? "chat" : k, title: kind === "chat" ? "" : TPL_DESC[k][2] };
      if (kind === "chat") Object.assign(p, { theme: k, frame: true, messages: JSON.parse(JSON.stringify(SAMPLE_MSGS)), bubbleAnim: "typing" });
      st.data.panels.push(p);
      st.sel = { type: "panel", id: p.id };
      changed(true);
      return toast(`${fmt(s0)}초에 그림판을 넣었어요. 레이아웃은 🎬 「레이아웃」 탭에서`);
    }
    if (!scopeValues()) return toast("자막을 하나 먼저 고르세요 (또는 「전체」 · 「같은 역할」로)");
    snapshot();
    st.bulk = true;
    try {
      if (bd.tab === "look") {
        const look = Object.assign({}, S.BASE.cap, S.STYLE_PRESETS[key].cap);
        KEEP_KEYS.forEach((x) => delete look[x]);
        for (const [k2, v2] of Object.entries(look)) setVal(k2, v2);
      } else if (bd.tab === "em") setVal("emMode", key);
      else { setVal("motion", key); setVal("speed", bd.speed); }
    } finally { st.bulk = false; }
    changed(true);
    const where = st.stScope === "role" ? `「${S.ROLES[st.stRole]}」 역할에` : st.stScope === "sel" ? "고른 것에" : "전체에";
    toast(`${where} 적용했어요: ${S.esc(bd.tab === "look" ? S.STYLE_PRESETS[key].label : bd.tab === "em" ? S.EM_MODES[key] : S.CAPTION_MOTIONS[key].label)}`, 2400);
    if (bd.tab === "look") return renderBoard();
    // 「지금 적용됨」 표시만 다시
    const sv = scopeValues();
    $("bdGrid").querySelectorAll(".bd-card").forEach((card) => {
      const keyI = card.dataset.key;
      const on = bd.tab === "em" ? sv.vals.emMode === keyI : sv.vals.motion === keyI;
      card.classList.toggle("on", on);
      const b = card.querySelector(".badge");
      if (on && !b) card.querySelector(".bd-frame").insertAdjacentHTML("afterend", `<span class="badge">✓ 지금 적용됨</span>`);
      if (!on && b) b.remove();
    });
  }

  // ── 기본 편집 틀 (레이아웃) ──
  const LAY_THUMB = {
    full: `<i class="face" style="top:30%"></i><i class="cap" style="top:70%"></i>`,
    split: `<i class="pan"></i><i class="ln" style="top:16%"></i><i class="ln" style="top:26%;left:30%;right:30%"></i><i class="face" style="top:55%"></i><i class="cap" style="top:85%"></i>`,
    titleBand: `<i class="band"></i><i class="face" style="top:36%"></i><i class="cap" style="top:76%"></i>`,
    card: `<i class="card"></i><i class="cardt"></i>`,
  };
  function renderLayout() {
    const box = $("layoutBox");
    const L = st.data.layout || "full";
    const sig = L + JSON.stringify(st.data.band || {});
    if (box.dataset.sig === sig && document.activeElement && box.contains(document.activeElement)) return;
    box.dataset.sig = sig;
    const b = st.data.band || {};
    box.innerHTML = `<div class="lay-grid">${Object.entries(S.LAYOUTS).map(([k, v]) => `<button class="lay-card${k === L ? " on" : ""}" data-lay="${k}" title="${S.esc(v.desc + " — " + v.fit)}"><div class="lay-th">${LAY_THUMB[k]}</div>${v.label}</button>`).join("")}</div>` +
      `<div class="muted small">${S.esc(S.LAYOUTS[L].desc)} · 어울리는 곳: ${S.esc(S.LAYOUTS[L].fit)}</div>` +
      (L === "titleBand" ? `<div class="lay-opts"><div class="vf"><label>띠 글자</label><input type="text" data-band="text" value="${S.esc(b.text || "")}" placeholder="예: 한의사가 알려주는 **잠** 이야기"></div>` +
        `<div class="vf"><label>띠 색</label><input type="color" data-band="bg" value="${S.esc(b.bg || "#111214")}"></div><div class="vf"><label>글자색</label><input type="color" data-band="color" value="${S.esc(b.color || "#ffffff")}"></div>` +
        `<div class="vf"><label>띠 높이</label><input type="number" data-band="h" value="${b.h || 360}" step="10"></div></div>` : "") +
      (L === "split" || L === "card" ? `<div class="row" style="margin-top:6px"><button id="btnAddPanel">＋ ${L === "split" ? "위 패널" : "글자 카드"} (재생 위치)</button><span class="muted small">${st.data.panels.length}개 · 타임라인 「틀 패널」 줄</span></div>` : "");
    box.querySelectorAll("[data-lay]").forEach((x) => (x.onclick = () => {
      snapshot();
      st.data.layout = x.dataset.lay;
      if ((x.dataset.lay === "split" || x.dataset.lay === "card") && !st.data.panels.length) addPanel(true);
      changed(true);
    }));
    box.querySelectorAll("[data-band]").forEach((inp) => {
      let snapped = false;
      inp.addEventListener("input", () => {
        if (!snapped) { snapshot(); snapped = true; }
        st.data.band = Object.assign({}, st.data.band, { [inp.dataset.band]: inp.type === "number" ? +inp.value : inp.value });
        changed(false);
      });
      inp.addEventListener("blur", () => (snapped = false));
    });
    if ($("btnAddPanel")) $("btnAddPanel").onclick = () => addPanel();
  }
  function addPanel(silent) {
    if (!silent) snapshot();
    const D = st.data.duration || 10;
    const s0 = Math.max(0, Math.min(st.t, D - 3));
    const cap = st.data.captions.find((c) => st.t >= c.start && st.t < c.end);
    const p = { id: uid("pn"), start: r2(s0), end: r2(Math.min(D, s0 + 3)), layout: st.data.layout === "card" ? "full" : "splitTop", tpl: "quote", title: "", tplData: { text: cap ? String(cap.text).replace(/\*\*/g, "") : "말을 그대로 적어요", source: "환자분" } };
    st.data.panels.push(p);
    st.sel = { type: "panel", id: p.id };
    if (!silent) changed(true);
  }

  // ── 효과음 ──
  function playSfx(name, vol) {
    try { const a = new Audio("/comp/sfx/" + name + ".mp3"); a.volume = Math.min(1, vol ?? 0.6); a.play().catch(() => toast("효과음을 재생하지 못했어요")); } catch (_) {}
  }
  function openSfxSuggest() {
    // 효과 문장(noEmphasis)은 역할이 있어도 제안하지 않음
    const rows = st.data.captions.filter((c) => c.role && S.SFX_SUGGEST[c.role] && S.isEmphasisCandidate(c)).sort((a, b) => a.start - b.start);
    if (!rows.length) return toast("역할(강조 · 숫자 · 질문 · 마무리)이 달린 자막이 없어요. 자막을 고르고 「선택한 것」에서 역할을 달아 주세요", 5000);
    const has = (c) => (st.data.sfx || []).some((x) => x.capId === c.id);
    modal(`<h3>역할별 효과음 제안</h3><div class="muted small">강조 = 쿵 · 숫자 = 딸깍 · 질문 = 핑 · 마무리 = 딩. 끄고 켠 뒤 「넣기」 (이미 넣은 것은 회색)</div>` +
      `<div class="sfx-sg">${rows.map((c) => `<label class="row"><input type="checkbox" data-sg="${c.id}" ${has(c) ? "disabled" : "checked"}> <b>${fmt(c.start)}초</b> ${S.esc(S.ROLES[c.role])} · ${S.esc(S.SFX_LIB[S.SFX_SUGGEST[c.role]].label)} <button class="small-btn" data-sgp="${S.SFX_SUGGEST[c.role]}">▶</button> <span class="muted small">${S.esc(String(c.text).replace(/\*\*/g, "").slice(0, 22))}</span></label>`).join("")}</div>` +
      `<div class="btns"><button id="mCancel">닫기</button><button id="mSg" class="accent">넣기</button></div>`);
    $("modalCard").querySelectorAll("[data-sgp]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); playSfx(b.dataset.sgp); }));
    $("mCancel").onclick = closeModal;
    $("mSg").onclick = () => {
      snapshot();
      let n = 0;
      $("modalCard").querySelectorAll("[data-sg]:checked:not(:disabled)").forEach((cb) => {
        const c = st.data.captions.find((x) => x.id === cb.dataset.sg);
        const name = S.SFX_SUGGEST[c.role];
        st.data.sfx.push({ id: uid("sfx"), name, file: "sfx/" + name + ".mp3", start: r2(c.start), end: r2(c.start + S.SFX_LIB[name].dur), volume: c.role === "emphasis" ? 0.45 : 0.35, capId: c.id, auto: true });
        n++;
      });
      closeModal();
      changed(true);
      toast(`효과음 ${n}개를 넣었어요. 타임라인 🔊 줄에서 고르면 크기 · 들어 보기`);
    };
  }

  // ── 넣기 ──
  function addCaption() {
    snapshot();
    const c0 = Math.max(0, Math.min(st.t, (st.data.duration || st.t + 1) - 1));
    const c = { id: uid("cap"), start: r2(c0), end: r2(Math.min(c0 + 1, st.data.duration || c0 + 1)), text: "새 자막", x: 540 }; // 모양 · 위치는 스타일 값을 따름
    st.data.captions.push(c);
    st.sel = { type: "caption", id: c.id };
    changed(true);
    setTimeout(() => $("inspector").querySelector("textarea")?.select(), 0);
  }
  function addOverlay() {
    snapshot();
    const kind = $("ovKind").value;
    const o0 = Math.max(0, Math.min(st.t, (st.data.duration || st.t + 1.5) - 1.5));
    const o = { id: uid("ov"), kind, start: r2(o0), end: r2(Math.min(o0 + 1.5, st.data.duration || o0 + 1.5)), x: 540, y: kind === "title" ? 300 : 336, size: 200, enter: "pop", exit: "none" };
    if (kind === "emoji") o.emoji = "📄";
    if (kind === "title") o.text = "위 글자";
    if (kind === "headline") Object.assign(o, { text: "첫 줄\n**강조** 둘째 줄", y: 380, enter: "slam" });
    if (kind === "chapter") Object.assign(o, { text: "1. 챕터 이름", y: 300 });
    if (kind === "app") Object.assign(o, { text: "App", size: 300, rot: -8, x: 300, y: 900 });
    if (kind === "bubble") Object.assign(o, { text: "말풍선", size: 360, y: 520 });
    if (kind === "aside") Object.assign(o, { enter: "none", exit: "none", end: r2(Math.min(o0 + 9, st.data.duration || o0 + 9)), prompt: "프롬프트를 여기에", questions: [{ q: "질문", options: ["보기 1", "보기 2", "보기 3", "기타 (직접 입력)"], pick: 0 }] });
    if (kind === "insert") {
      const other = (st.media.videos || []).find((v) => v !== st.data.source);
      Object.assign(o, { src: other || st.data.source, from: other ? 0 : r2(Math.min(10, Math.max(0, (st.data.duration || 12) - 4))), muted: true, enter: "fade", exit: "fade", x: 540, y: 960, end: r2(Math.min(o0 + 2, st.data.duration || o0 + 2)) });
    }
    if (kind === "chat") Object.assign(o, { title: "환자분", messages: JSON.parse(JSON.stringify(SAMPLE_MSGS)), theme: "yellow", frame: true, layout: "splitTop", bubbleAnim: "typing", x: 540, y: 260, w: 900, enter: "auto", end: r2(Math.min(o0 + 4.5, st.data.duration || o0 + 4.5)) });
    if (kind === "sticker") {
      const img = (st.media.images || [])[0];
      Object.assign(o, { src: img || "", emoji: img ? undefined : "⭐", size: 260, x: 820, y: 980, rot: -6, idle: "float", enter: "pop", end: r2(Math.min(o0 + 2.5, st.data.duration || o0 + 2.5)) });
    }
    if (kind === "quiz") Object.assign(o, { text: "질문", options: "1번 보기|2번 보기|3번 보기|기타 (직접 입력)", y: 1180, enter: "rise", pickAt: 0.9, pick: 0, end: r2(Math.min(o0 + 3, st.data.duration || o0 + 3)) });
    st.data.overlays.push(o);
    st.sel = { type: "overlay", id: o.id };
    changed(true);
  }
  function addSfx() {
    snapshot();
    if (!st.data.sfx) st.data.sfx = [];
    const name = $("sfxKind").value;
    const x = { id: uid("sfx"), name, file: "sfx/" + name + ".mp3", start: r2(st.t), end: r2(st.t + (S.SFX_LIB[name]?.dur || 0.6)), volume: 0.35 };
    st.data.sfx.push(x);
    st.sel = { type: "sfx", id: x.id };
    changed(true);
  }
  const FX_LEN = new Proxy({}, { get: (_, k) => S.EFFECTS[k]?.len || 1 });
  function addEffect(type) {
    snapshot();
    const D = st.data.duration || st.t + FX_LEN[type];
    const s0 = Math.max(0, Math.min(st.t, D - FX_LEN[type]));
    const e = { id: uid("fx"), type, start: r2(s0), end: r2(Math.min(s0 + FX_LEN[type], D)), strength: 1, ax: 540, ay: 800 };
    st.data.effects.push(e);
    st.sel = { type: "effect", id: e.id };
    changed(true);
    toast(`${S.EFFECTS[type].label}을 ${fmt(e.start)}초에 넣었어요. 노란 동그라미로 중심을, 타임라인 끝을 끌어 길이를 정하세요`);
  }
  function addKeyframe() {
    snapshot();
    const prev = st.data.camera.slice().sort((a, b) => a.t - b.t).filter((k) => k.t <= st.t).pop();
    const k = { id: uid("kf"), t: r2(st.t), scale: prev?.scale ?? 1, ax: prev?.ax ?? 540, ay: prev?.ay ?? 800 };
    st.data.camera.push(k);
    st.sel = { type: "camera", id: k.id };
    changed(true);
    if (st.data.camera.length === 1) toast("키프레임을 하나 더 찍고 「확대」 값을 바꾸면 그 사이가 움직여요");
  }
  function addFeedback() {
    setPlaying(false);
    snapshot();
    const f = { id: uid("fb"), t: r2(st.t), note: "", status: "open", createdAt: new Date().toISOString() };
    st.data.feedback.push(f);
    st.sel = { type: "feedback", id: f.id };
    changed(true);
    setTimeout(() => $("fbNote")?.focus(), 0);
  }

  // ── 보내기 · 렌더 ──
  function modal(html) {
    $("modalCard").innerHTML = html;
    $("modal").classList.remove("hidden");
  }
  const closeModal = () => $("modal").classList.add("hidden");
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  function openSend() {
    const open = st.data.feedback.filter((f) => f.status !== "done");
    modal(
      `<h3>Claude에게 보내기</h3><div class="muted small">지금 편집본을 저장하고, 대기 중인 피드백 ${open.length}개를 함께 보내요.</div>` +
        `<ul>${open.slice().sort((a, b) => a.t - b.t).map((f) => `<li>${fmt(f.t)}초 — ${S.esc(f.note || "(내용 없음)")}</li>`).join("")}</ul>` +
        `<textarea id="sendMsg" placeholder="한마디 더 (선택)"></textarea>` +
        `<div class="btns"><button id="mCancel">취소</button><button id="mSend" class="accent">보내기</button></div>`
    );
    $("mCancel").onclick = closeModal;
    $("mSend").onclick = async () => {
      const r = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edit: st.data, baseVersion: st.dirty ? st.version : "", message: $("sendMsg").value, playhead: st.t }) }).then((x) => x.json());
      closeModal();
      if (r.error) { await reloadFromServer(r.error + " — 새로 불러왔어요. 다시 보내 주세요."); return; }
      st.version = r.version;
      st.dirty = false;
      $("saveState").textContent = "보냄 " + new Date().toLocaleTimeString("ko-KR");
      toast(`보냈어요 (대기 피드백 ${r.openCount}개).<br>Claude 대화창에 <b>「편집기 확인해 줘」</b>라고 말하면 바로 읽고 고쳐요.`, 7000);
    };
  }

  async function startRender() {
    const q = $("renderQuality").value;
    const r = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quality: q, edit: st.data, baseVersion: st.version }) });
    if (!r.ok) { const j = await r.json(); if (j.version) await reloadFromServer(); return toast(j.error || "렌더를 시작하지 못했어요"); }
    st.version = (await r.json()).version;
    $("btnRender").disabled = true;
    pollRender();
  }
  async function pollRender() {
    const s = await fetch("/api/render/status").then((x) => x.json());
    const last = (s.log || []).slice(-1)[0] || "";
    if (s.state === "running") {
      $("renderState").textContent = `렌더 중 ${Math.round(s.elapsed)}초… ${last.slice(0, 40)}`;
      setTimeout(pollRender, 1000);
      return;
    }
    $("btnRender").disabled = false;
    if (s.state === "done") {
      $("renderState").innerHTML = `<a href="#" id="seeRender" style="color:#9fd">렌더 완료 (${Math.round(s.elapsed)}초) · 보기</a>`;
      $("seeRender").onclick = (e) => { e.preventDefault(); showRender(s.url); };
      showRender(s.url);
    } else if (s.state === "failed") {
      $("renderState").textContent = "렌더 실패";
      modal(`<h3>렌더 실패</h3><pre style="white-space:pre-wrap;font-size:11px">${S.esc((s.log || []).join("\n"))}</pre><div class="btns"><button onclick="document.getElementById('modal').classList.add('hidden')">닫기</button></div>`);
    }
  }
  function showRender(url) {
    modal(`<h3>렌더 결과</h3><video src="${url}?v=${Date.now()}" controls autoplay playsinline></video><div class="muted small">${url}</div><div class="btns"><button id="mClose">닫기</button></div>`);
    $("mClose").onclick = closeModal;
  }

  // ── 키보드 ──
  function onKey(e) {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
    if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (typing) return;
    if (e.code === "Space") { e.preventDefault(); setPlaying(!st.playing); }
    else if (e.key === "ArrowLeft") { setPlaying(false); seek(st.t - (e.shiftKey ? 1 : 1 / FPS)); }
    else if (e.key === "ArrowRight") { setPlaying(false); seek(st.t + (e.shiftKey ? 1 : 1 / FPS)); }
    else if (e.key.toLowerCase() === "f") { e.preventDefault(); addFeedback(); }
    else if (e.key.toLowerCase() === "k") { addKeyframe(); }
    else if ((e.key === "Delete" || e.key === "Backspace") && st.sel) { act("del"); }
  }

  // ── 시작 ──
  async function init() {
    const info = await fetch("/api/info").then((x) => x.json());
    $("proj").textContent = "· " + info.name;
    const r = await fetch("/api/edit");
    if (!r.ok) {
      document.body.innerHTML = `<div style="padding:40px">edit.json 을 찾지 못했어요: ${S.esc((await r.json()).path)}</div>`;
      return;
    }
    st.version = r.headers.get("X-Edit-Version") || "";
    st.data = S.defaults(await r.json());
    $("saveState").textContent = "불러옴";
    // 효과 팔레트 · 아이콘 종류
    $("fxPalette").innerHTML = Object.entries(S.EFFECTS).map(([k, v]) => `<button class="fxb" data-fx="${k}" title="${v.desc}">${v.label}<small>${v.desc}</small><span class="pv" data-pv="${k}" title="미리보기만 (넣지 않음)">▶</span></button>`).join("");
    $("fxPalette").querySelectorAll("button").forEach((b) => (b.onclick = (e) => {
      if (e.target.dataset.pv) previewEffect(e.target.dataset.pv);
      else addEffect(b.dataset.fx);
    }));
    $("stRole").onchange = (e) => { st.stRole = e.target.value; renderStylePanel(); };
    $("stLoad").onclick = () => {
      const pr = S.STYLE_PRESETS[$("stPreset").value];
      if (!pr) return;
      const vals = st.stTarget === "cap" ? pr.cap : st.stTarget === "head" ? pr.head : pr[st.stTarget] || {};
      snapshot();
      // 시작점: 그 대상의 모든 칸을 기본값 + 시작점 값으로 채움 (그다음 하나씩 고침)
      setVals(Object.assign({}, S.BASE[st.stTarget], vals));
      changed(true);
      toast(`시작점 「${S.esc(pr.label)}」 값을 채웠어요. 이제 하나씩 바꿔 보세요`);
    };
    $("myStyleSave").onclick = saveMyStyle;
    $("btnBoard").onclick = () => openBoard("motion");
    $("bdClose").onclick = closeBoard;
    $("bdRole").onchange = (e) => { st.stRole = e.target.value; renderBoard(); };
    $("btnSfxPlay").onclick = () => playSfx($("sfxKind").value);
    $("btnSfxSuggest").onclick = openSfxSuggest;
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && st.picking) { stopPicking(); toast("스포이트를 껐어요", 1200); }
      else if (e.key === "Escape" && !$("board").classList.contains("hidden")) closeBoard();
    });
    st.media = await fetch("/api/media").then((x) => x.json()).catch(() => ({ videos: [], images: [] }));
    $("ovKind").innerHTML = Object.entries(S.OVERLAY_KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");

    mountStage();
    fitStage();
    renderStage();
    renderTimeline();
    renderInspector();
    renderFeedback();
    loadRefs();
    initAnchorDrag();
    initTimelineSeek();

    $("btnPlay").onclick = () => setPlaying(!st.playing);
    $("btnBack").onclick = () => { setPlaying(false); seek(st.t - 1 / FPS); };
    $("btnFwd").onclick = () => { setPlaying(false); seek(st.t + 1 / FPS); };
    $("btnFeedback").onclick = addFeedback;
    $("btnAddCap").onclick = addCaption;
    $("btnAddOv").onclick = addOverlay;
    $("sfxKind").innerHTML = Object.entries(S.SFX_LIB).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
    $("btnAddSfx").onclick = addSfx;
    $("btnAddKf").onclick = addKeyframe;
    $("btnSave").onclick = save;
    $("btnSend").onclick = openSend;
    $("btnRender").onclick = startRender;
    $("btnUndo").onclick = undo;
    $("btnRedo").onclick = redo;
    $("chkSafe").onchange = (e) => $("safe").classList.toggle("hidden", !e.target.checked);
    $("tlZoom").oninput = (e) => { st.pps = +e.target.value; renderTimeline(); seekVisual(st.t); };
    window.addEventListener("resize", () => { fitStage(); drawSelection(); });
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", (e) => { if (st.dirty) { save(); e.preventDefault(); } });
    requestAnimationFrame(loop);
    watchVersion();
  }
  init();
})();
