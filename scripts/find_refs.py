#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
비슷한 주제에서 가장 잘 터진 숏폼 찾기 (2단계 레퍼런스 리서치)

유튜브 쇼츠를 낱말마다 검색해 조회수 순으로 모으고, 위 후보는 채널 구독자 수까지 받아
「채널 크기보다 얼마나 더 터졌나(배수)」를 함께 적는다. 결과는 표(md) · 값(json) · 썸네일 판(png).

쓰는 법:
  python3 find_refs.py --out 편집/1125_아바타01/refs/research "한약 복용" "약 먹는 시간" "한의원 상담"
  옵션: --per 50 (낱말마다 받을 개수) --top 8 (자세히 볼 개수) --max-sec 90 (쇼츠 길이 상한)

필요: yt-dlp (없으면 brew install yt-dlp 또는 pip install yt-dlp), 썸네일 판은 Pillow가 있을 때만.
숫자는 유튜브가 보여 주는 것만 쓴다. 못 받으면 비워 두고 표에 「미확인」.
"""
import argparse
import datetime
import json
import subprocess
import sys
import urllib.request
from pathlib import Path


def run_json_lines(args):
    # yt-dlp 결과(JSON 줄)를 읽는다. 실패한 줄은 건너뛴다.
    p = subprocess.run(args, capture_output=True, text=True)
    rows = []
    for line in p.stdout.splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def search(keyword, per):
    # 낱말 그대로 · #shorts · 쇼츠 세 가지로 검색해 쇼츠를 넓게 모은다 (평면 목록이라 빠르다)
    rows = []
    for q in (f"{keyword} #shorts", f"{keyword} 쇼츠", keyword):
        rows += run_json_lines([
            "yt-dlp", "--no-update", "--flat-playlist", "-j", f"ytsearch{per}:{q}",
        ])
    return rows


def detail(url):
    # 한 편의 자세한 값: 올린 날 · 좋아요 · 채널 구독자 수
    rows = run_json_lines(["yt-dlp", "--no-update", "--skip-download", "-j", url])
    return rows[0] if rows else {}


def fmt(n):
    if n is None:
        return "미확인"
    if n >= 10000:
        return f"{n / 10000:.1f}만"
    return f"{n:,}"


def note_of(t):
    # 조회수를 그대로 믿으면 안 되는 경우를 적는다
    notes = []
    v, r = t.get("views") or 0, t.get("views_per_sub")
    if r is not None and r >= 100:
        notes.append("광고 집행 의심(구독자에 비해 조회수가 너무 큼)")
    elif v >= 10000 or (v >= 3000 and r is not None and r >= 3):
        notes.append("터진 편")
    if r is not None and r < 0.1:
        notes.append("큰 채널 힘")
    day = t.get("upload_date") or ""
    if len(day) == 8 and int(day[:4]) <= datetime.date.today().year - 2:
        notes.append("2년 넘음")
    return " · ".join(notes) or "-"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("keywords", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--per", type=int, default=50)
    ap.add_argument("--top", type=int, default=8)
    ap.add_argument("--max-sec", type=int, default=90)
    a = ap.parse_args()

    out = Path(a.out)
    (out / "thumbs").mkdir(parents=True, exist_ok=True)

    # 1) 낱말마다 검색 → 쇼츠 길이만 → 중복 빼기
    seen, pool = set(), []
    for kw in a.keywords:
        for d in search(kw, a.per):
            vid = d.get("id")
            dur = d.get("duration") or 0
            if not vid or vid in seen or dur == 0 or dur > a.max_sec:
                continue
            seen.add(vid)
            d["_kw"] = kw
            pool.append(d)
    if not pool:
        print("검색 결과가 없어요. 낱말을 더 넓게(예: 업종 + 고민) 바꿔 보세요.")
        sys.exit(1)

    # 2) 조회수 순 → 위 후보만 자세히
    pool.sort(key=lambda d: -(d.get("view_count") or 0))
    top = []
    for d in pool[: a.top]:
        url = d.get("url") or f"https://www.youtube.com/shorts/{d['id']}"
        full = detail(url)
        views = full.get("view_count") or d.get("view_count")
        subs = full.get("channel_follower_count")
        ratio = round(views / subs, 2) if views is not None and subs else None
        top.append({
            "id": d["id"],
            "url": f"https://www.youtube.com/shorts/{d['id']}",
            "title": full.get("title") or d.get("title"),
            "channel": full.get("channel") or d.get("channel"),
            "views": views,
            "likes": full.get("like_count"),
            "subscribers": subs,
            "views_per_sub": ratio,
            "upload_date": full.get("upload_date"),
            "duration": full.get("duration") or d.get("duration"),
            "keyword": d["_kw"],
            "thumb": f"thumbs/{d['id']}.jpg",
        })
        # 썸네일: 세로 프레임(oar2) → 영상 정보의 대표 이미지 → 기본 이미지 순으로 시도
        for turl in (f"https://i.ytimg.com/vi/{d['id']}/oar2.jpg", full.get("thumbnail"),
                     f"https://i.ytimg.com/vi/{d['id']}/hqdefault.jpg"):
            if not turl:
                continue
            try:
                urllib.request.urlretrieve(turl, out / "thumbs" / f"{d['id']}.jpg")
                break
            except Exception:
                continue

    # 자세히 받은 조회수로 다시 정렬
    top.sort(key=lambda t: -(t["views"] or 0))

    # 3) 저장: json · 표
    lines = [
        "# 레퍼런스 후보 (유튜브 쇼츠 · 조회수 순)",
        "",
        f"검색 낱말: {', '.join(a.keywords)} · 쇼츠 {a.max_sec}초 이하 · 모은 {len(pool)}편 중 위 {len(top)}편",
        "",
        "| # | 제목 | 채널 | 조회수 | 구독자 | 배수 | 올린 날 | 길이 | 메모 | 링크 |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for i, t in enumerate(top, 1):
        day = t["upload_date"] or ""
        day = f"{day[:4]}-{day[4:6]}-{day[6:]}" if len(day) == 8 else "미확인"
        ratio = f"{t['views_per_sub']}배" if t["views_per_sub"] is not None else "미확인"
        t["note"] = note_of(t)
        lines.append(
            f"| {i} | {t['title']} | {t['channel']} | {fmt(t['views'])} | {fmt(t['subscribers'])} | {ratio} | {day} | {t['duration']}초 | {t['note']} | {t['url']} |")
    lines += ["", "배수 = 조회수 ÷ 채널 구독자. 조회수 1만 이상, 또는 3천 이상이면서 배수 3배 이상이면 「터진 편」. 배수 100배 이상은 광고비로 올린 조회수일 수 있어 「광고 집행 의심」으로 적고 1순위로 추천하지 않는다. 2년 넘은 편은 지금 흐름과 다를 수 있다."]
    (out / "candidates.md").write_text("\n".join(lines), encoding="utf-8")
    (out / "candidates.json").write_text(json.dumps(top, ensure_ascii=False, indent=2), encoding="utf-8")

    # 4) 썸네일 판 (Pillow 있을 때만)
    try:
        from PIL import Image, ImageDraw, ImageFont
        # 한글이 깨지지 않게 스킬 안 글꼴을 쓴다
        font_path = Path(__file__).resolve().parent.parent / "tools" / "editor" / "fonts" / "PretendardVariable.ttf"
        try:
            font = ImageFont.truetype(str(font_path), 20)
        except Exception:
            font = ImageFont.load_default()
        tw, th, cols = 270, 480, 4
        rows_n = (len(top) + cols - 1) // cols
        board = Image.new("RGB", (tw * cols, (th + 40) * rows_n), (0, 0, 0))
        dr = ImageDraw.Draw(board)
        for i, t in enumerate(top):
            x, y = (i % cols) * tw, (i // cols) * (th + 40)
            p = out / t["thumb"]
            if p.exists():
                im = Image.open(p).convert("RGB")
                s = max(tw / im.width, th / im.height)
                im = im.resize((int(im.width * s), int(im.height * s)))
                cx, cy = (im.width - tw) // 2, (im.height - th) // 2
                board.paste(im.crop((cx, cy, cx + tw, cy + th)), (x, y))
            dr.rectangle([x, y + th, x + tw, y + th + 40], fill=(233, 237, 18))
            dr.text((x + 10, y + th + 8), f"#{i + 1}  조회 {fmt(t['views'])}", fill=(0, 0, 0), font=font)
        board.save(out / "board.png")
    except ImportError:
        pass

    print((out / "candidates.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
