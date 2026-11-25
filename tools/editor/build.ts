// edit.json → HyperFrames index.html 빌드 (편집기 미리보기와 같은 scene.js 사용)
// 사용법: node build.ts <컴포지션 폴더>
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./scene.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const S = (globalThis as any).SFScene;

// 스킬에 든 글꼴(OFL)과 라이선스를 컴포지션 fonts/ 에 채워 넣는다 (이미 있으면 그대로)
export function ensureFonts(compDir: string) {
  const src = path.join(here, "fonts");
  if (!existsSync(src)) return;
  const dst = path.join(compDir, "fonts");
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    if (!existsSync(path.join(dst, f))) copyFileSync(path.join(src, f), path.join(dst, f));
  }
}

// 스킬에 든 효과음(직접 합성)을 컴포지션 sfx/ 에 채워 넣는다
export function ensureSfx(compDir: string) {
  const src = path.join(here, "sfx");
  if (!existsSync(src)) return;
  const dst = path.join(compDir, "sfx");
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    if (f.endsWith(".mp3") && !existsSync(path.join(dst, f))) copyFileSync(path.join(src, f), path.join(dst, f));
  }
}

export function buildComposition(compDir: string): { html: string; out: string } {
  const editPath = path.join(compDir, "edit.json");
  const data = S.defaults(JSON.parse(readFileSync(editPath, "utf8")));
  // 장면 모듈을 컴포지션 폴더에 복사 (렌더할 때 같은 코드로 타임라인을 만듦)
  copyFileSync(path.join(here, "scene.js"), path.join(compDir, "scene.js"));
  ensureFonts(compDir);
  ensureSfx(compDir);
  const font = existsSync(path.join(compDir, "fonts/PretendardVariable.ttf"))
    ? `@font-face{font-family:"Pretendard";src:url("fonts/PretendardVariable.ttf") format("truetype");font-weight:100 900}`
    : "";
  const html = `<!doctype html>
<html lang="ko" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${data.width}, height=${data.height}" />
    <!-- 이 파일은 숏폼 편집기(edit.json)에서 자동으로 만든 것: 직접 고치지 말고 편집기나 edit.json 을 고친다 -->
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <script src="scene.js"></script>
    <style>
      ${font}
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${data.width}px; height: ${data.height}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Pretendard", sans-serif; }
      ${S.CSS}
      ${S.pageCSS(data, "", "#root")}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${data.duration}" data-width="${data.width}" data-height="${data.height}">
${S.renderBody(data)}
    </div>
    <script>
      const EDIT = ${JSON.stringify(data)};
      const tl = gsap.timeline({ paused: true });
      SFScene.buildTimeline(gsap, tl, EDIT, document);
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
  const out = path.join(compDir, "index.html");
  writeFileSync(out, html);
  return { html, out };
}

// 직접 실행했을 때
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("사용법: node build.ts <컴포지션 폴더>");
    process.exit(1);
  }
  console.log(buildComposition(path.resolve(dir)).out);
}
