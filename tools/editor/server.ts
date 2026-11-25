// 숏폼 로컬 편집기 서버 (의존성 없음, Node 24 이상에서 node server.ts 로 실행)
// 사용법: node server.ts --project <edit/slug 폴더> [--comp <컴포지션 폴더>] [--port 4317]
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildComposition, ensureFonts, ensureSfx } from "./build.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : def;
};
const project = path.resolve(arg("project", ".")!);
const comp = path.resolve(arg("comp", path.join(project, "video/main"))!);
const port = Number(arg("port", "4317"));
const editPath = path.join(comp, "edit.json");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mov": "video/quicktime", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ttf": "font/ttf", ".otf": "font/otf", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif", ".webm": "video/webm",
};

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function send(res: http.ServerResponse, code: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// 폴더 밖 파일은 내주지 않는다
function safeJoin(base: string, rel: string): string | null {
  const p = path.resolve(base, "." + path.sep + decodeURIComponent(rel));
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

// 동영상 탐색이 되도록 Range 요청 처리
function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string | null) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: "없음" });
  const size = statSync(file).size;
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Number(m[2]) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "no-store" });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
    createReadStream(file).pipe(res);
  }
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

// 피드백을 사람이 읽는 파일로도 남긴다 (프로젝트/FEEDBACK.md)
function writeFeedbackMd(data: any) {
  const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
  const rows = (data.feedback || [])
    .slice()
    .sort((a: any, b: any) => a.t - b.t)
    .map((f: any) => `| ${f.status === "done" ? "✔ 반영" : "○ 대기"} | ${fmt(f.t)} | ${String(f.note || "").replace(/\|/g, "／").replace(/\n/g, " ")} | ${f.id} |`);
  const md = `# 편집기 피드백 — 자동 생성 (편집기에서 고친다)\n\n| 상태 | 시각 | 피드백 | id |\n|---|---|---|---|\n${rows.join("\n")}\n`;
  writeFileSync(path.join(project, "FEEDBACK.md"), md);
}

// edit.json 버전 = 마지막 수정 시각
const version = () => (existsSync(editPath) ? String(Math.floor(statSync(editPath).mtimeMs)) : "0");

function saveEdit(data: any) {
  // 바로 전 상태를 기록에 남김 (최근 50개)
  const hist = path.join(comp, ".edit-history");
  mkdirSync(hist, { recursive: true });
  if (existsSync(editPath)) copyFileSync(editPath, path.join(hist, stamp() + ".json"));
  const old = readdirSync(hist).sort();
  for (const f of old.slice(0, Math.max(0, old.length - 50))) unlinkSync(path.join(hist, f));
  writeFileSync(editPath, JSON.stringify(data, null, 1));
  writeFeedbackMd(data);
}

// 레퍼런스: 프로젝트 REFERENCE.md 의 「고른 것」 · 「가져올 것」 · 「가져오지 않을 것」 + refs/ 영상
function readReference() {
  const f = path.join(project, "REFERENCE.md");
  const out: any = { chosen: "", takeaways: [], notTake: [], videos: [] };
  if (existsSync(f)) {
    const md = readFileSync(f, "utf8");
    const chosen = /^고른 것:\s*(.+)$/m.exec(md);
    if (chosen) out.chosen = chosen[1].replace(/\*\*/g, "");
    const sec = (title: string) => {
      const i = md.indexOf("## " + title);
      if (i < 0) return "";
      const rest = md.slice(i + title.length + 3);
      const j = rest.indexOf("\n## ");
      return j < 0 ? rest : rest.slice(0, j);
    };
    out.takeaways = sec("가져올 것")
      .split("\n")
      .filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l) && !l.includes("레퍼런스 시각"))
      .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
      .filter((c) => c.length >= 3)
      .map((c) => ({ time: c[0], observed: c[1], apply: c[2] }));
    out.notTake = sec("가져오지 않을 것").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
    const link = /instagram\.com\/reel\/[A-Za-z0-9_-]+/.exec(out.chosen) || /instagram\.com\/reel\/[A-Za-z0-9_-]+/.exec(md);
    out.link = link ? "https://www." + link[0] + "/" : "";
  }
  const refs = path.join(project, "refs");
  if (existsSync(refs)) out.videos = readdirSync(refs).filter((n) => /\.(mp4|mov)$/i.test(n)).map((n) => "/project/refs/" + n);
  return out;
}

// 렌더 상태 (워크숍 컴퓨터엔 hyperframes가 따로 설치돼 있지 않을 수 있어 버전을 고정해 npx로 부른다)
const render: { state: string; log: string[]; out?: string; started?: number; ended?: number } = { state: "idle", log: [] };

function startRender(quality: string) {
  if (render.state === "running") return false;
  buildComposition(comp);
  mkdirSync(path.join(project, "renders"), { recursive: true });
  const out = path.join(project, "renders", `edit-${stamp()}.mp4`);
  Object.assign(render, { state: "running", log: [], out, started: Date.now(), ended: undefined });
  const p = spawn("npx", ["--yes", "hyperframes@0.9.40", "render", "--quality", quality, "-o", out], { cwd: comp });
  const push = (b: Buffer) => {
    render.log.push(...b.toString().split(/\r?\n/).filter(Boolean));
    render.log = render.log.slice(-40);
  };
  p.stdout.on("data", push);
  p.stderr.on("data", push);
  p.on("close", (code) => {
    render.state = code === 0 && existsSync(out) ? "done" : "failed";
    render.ended = Date.now();
  });
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const p = url.pathname;
    if (p === "/" || p === "/index.html") return sendFile(req, res, path.join(here, "public/index.html"));
    if (p === "/scene.js") return sendFile(req, res, path.join(here, "scene.js"));
    if (p.startsWith("/static/")) return sendFile(req, res, safeJoin(path.join(here, "public"), p.slice(8)));
    if (p.startsWith("/comp/")) return sendFile(req, res, safeJoin(comp, p.slice(6)));
    if (p.startsWith("/project/")) return sendFile(req, res, safeJoin(project, p.slice(9)));

    if (p === "/api/edit" && req.method === "GET") {
      if (!existsSync(editPath)) return send(res, 404, { error: "edit.json 없음", path: editPath });
      res.setHeader("X-Edit-Version", version());
      return send(res, 200, readFileSync(editPath, "utf8"));
    }
    if (p === "/api/edit/version") return send(res, 200, { version: version() });
    if (p === "/api/edit" && req.method === "PUT") {
      // 편집기가 불러온 뒤 파일이 바뀌었으면(Claude가 고침 등) 덮어쓰지 않는다
      const base = String(req.headers["x-base-version"] || "");
      if (base && base !== version()) return send(res, 409, { error: "다른 곳에서 바뀜", version: version() });
      saveEdit(await readBody(req));
      return send(res, 200, { ok: true, savedAt: new Date().toISOString(), version: version() });
    }
    if (p === "/api/reference") return send(res, 200, readReference());
    // media/ · assets/ 안의 영상 · 이미지 목록 (장면 컷 · 스티커 고르기)
    if (p === "/api/media") {
      const out: { videos: string[]; images: string[] } = { videos: [], images: [] };
      for (const dir of ["media", "assets"]) {
        const d = path.join(comp, dir);
        if (!existsSync(d)) continue;
        for (const n of readdirSync(d).sort()) {
          if (/\.(mp4|mov|webm)$/i.test(n)) out.videos.push(dir + "/" + n);
          else if (/\.(png|webp|gif|jpe?g|svg)$/i.test(n)) out.images.push(dir + "/" + n);
        }
      }
      return send(res, 200, out);
    }
    // 레퍼런스: 프로젝트 refs/ 안의 영상 · 이미지 + refs/ref-style.json (Claude가 뽑은 값 카드)
    if (p === "/api/refs") {
      const dir = path.join(project, "refs");
      const files: string[] = [];
      let refStyle: any = null;
      if (existsSync(dir)) {
        for (const n of readdirSync(dir).sort()) if (/\.(mp4|mov|webm|png|jpe?g|webp)$/i.test(n)) files.push("refs/" + n);
        const f = path.join(dir, "ref-style.json");
        if (existsSync(f)) {
          try { refStyle = JSON.parse(readFileSync(f, "utf8")); } catch (e: any) { refStyle = { error: "ref-style.json 을 읽지 못했어요: " + e.message }; }
        }
      }
      return send(res, 200, { files, refStyle, reference: readReference() });
    }
    // 내 스타일 파일로 내보내기 → 프로젝트/my-style.json (저장소 규칙/ 에 복사해 두면 다음에도 씀)
    if (p === "/api/export-style" && req.method === "POST") {
      const body = await readBody(req);
      const out = path.join(project, "my-style.json");
      writeFileSync(out, JSON.stringify(Object.assign({ kind: "selfish-my-style", version: 1, exportedAt: new Date().toISOString() }, body), null, 1));
      return send(res, 200, { ok: true, file: out });
    }
    if (p === "/api/info") return send(res, 200, { project, comp, name: path.basename(project) });

    // Claude에게 보내기: 지금 편집본 저장 + 받은편지함에 한 건 남김
    if (p === "/api/send" && req.method === "POST") {
      const body = await readBody(req);
      if (body.baseVersion && body.baseVersion !== version()) return send(res, 409, { error: "다른 곳에서 바뀜", version: version() });
      saveEdit(body.edit);
      const inbox = path.join(project, "editor-inbox");
      mkdirSync(inbox, { recursive: true });
      const file = path.join(inbox, stamp() + ".json");
      const open = (body.edit.feedback || []).filter((f: any) => f.status !== "done");
      writeFileSync(file, JSON.stringify({ sentAt: new Date().toISOString(), message: body.message || "", playhead: body.playhead, openFeedback: open, editFile: editPath }, null, 1));
      return send(res, 200, { ok: true, file, openCount: open.length, version: version() });
    }
    if (p === "/api/build" && req.method === "POST") return send(res, 200, { ok: true, out: buildComposition(comp).out });
    if (p === "/api/render" && req.method === "POST") {
      const body = await readBody(req);
      if (body.baseVersion && body.baseVersion !== version()) return send(res, 409, { error: "다른 곳에서 바뀜 — 새로 불러온 뒤 다시 렌더하세요", version: version() });
      if (body.edit) saveEdit(body.edit);
      const ok = startRender(body.quality === "standard" ? "standard" : "draft");
      return send(res, ok ? 200 : 409, ok ? { ok: true, version: version() } : { error: "이미 렌더 중" });
    }
    if (p === "/api/render/status") {
      return send(res, 200, { ...render, url: render.out ? "/project/renders/" + path.basename(render.out) : null, elapsed: render.started ? ((render.ended || Date.now()) - render.started) / 1000 : 0 });
    }
    return send(res, 404, { error: "없는 주소" });
  } catch (e: any) {
    return send(res, 500, { error: String(e?.message || e) });
  }
});

// 편집기 미리보기에서도 글꼴이 보이게 시작할 때 채워 둔다
try { ensureFonts(comp); ensureSfx(comp); } catch (_) {}

server.listen(port, "127.0.0.1", () => {
  console.log(`숏폼 편집기: http://localhost:${port}`);
  console.log(`프로젝트: ${project}\n컴포지션: ${comp}`);
});
