"""긴 쉼만 줄인다. 말 사이 짧은 숨은 남기고, 기준보다 긴 쉼은 양쪽 여유만 남기고 자른다.

ffmpeg silencedetect로 쉼을 찾고, 남길 구간을 trim/atrim + concat으로 이어 붙인다.
자른 목록(*.cuts.json)을 같이 남겨 자막 시각을 옮길 수 있게 한다.

사용법:
  python3 trim_silence.py <입력.mp4> <출력.mp4> [--min 0.35] [--pad 0.09] [--db -35]
"""
import argparse
import json
import re
import subprocess
from pathlib import Path


def probe_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def has_video(path: str) -> bool:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=index", "-of", "csv=p=0", path],
        capture_output=True, text=True,
    ).stdout.strip()
    return bool(out)


def detect_silences(path: str, db: float, min_len: float) -> list:
    res = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", path, "-af", f"silencedetect=noise={db}dB:d={min_len}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", res.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", res.stderr)]
    return list(zip(starts, ends))


def keep_segments(silences: list, total: float, pad: float) -> list:
    # 쉼 구간에서 양쪽 pad만 남기고 가운데를 버린다
    keep, cur = [], 0.0
    for s, e in silences:
        cut_from, cut_to = s + pad, e - pad
        if cut_to - cut_from <= 0.02:
            continue
        if cut_from > cur:
            keep.append((round(cur, 3), round(cut_from, 3)))
        cur = cut_to
    if total - cur > 0.02:
        keep.append((round(cur, 3), round(total, 3)))
    return keep


def build(path: str, out: str, keep: list, video: bool) -> None:
    parts, labels = [], []
    for i, (a, b) in enumerate(keep):
        if video:
            parts.append(f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{i}]")
        # 이음새 딸깍 소리를 막는 짧은 페이드
        fade = min(0.018, (b - a) / 4)
        parts.append(
            f"[0:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={fade},afade=t=out:st={max(0, b - a - fade)}:d={fade}[a{i}]"
        )
        labels.append((f"[v{i}]" if video else "") + f"[a{i}]")
    n = len(keep)
    concat = "".join(labels) + f"concat=n={n}:v={1 if video else 0}:a=1" + ("[v][a]" if video else "[a]")
    fc = ";".join(parts + [concat])
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", path, "-filter_complex", fc]
    if video:
        cmd += ["-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"]
    else:
        cmd += ["-map", "[a]"]
    cmd += ["-c:a", "aac", "-b:a", "192k", out]
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--min", type=float, default=0.35, help="이보다 긴 쉼만 줄임(초)")
    ap.add_argument("--pad", type=float, default=0.09, help="쉼 양쪽에 남길 길이(초)")
    ap.add_argument("--db", type=float, default=-35, help="이보다 작은 소리를 쉼으로 봄(dB)")
    args = ap.parse_args()

    total = probe_duration(args.src)
    silences = detect_silences(args.src, args.db, args.min)
    keep = keep_segments(silences, total, args.pad)
    if not keep:
        raise SystemExit("남길 구간이 없어요. --db 값을 낮춰 보세요(예: -45).")
    build(args.src, args.dst, keep, has_video(args.src))

    new_total = sum(b - a for a, b in keep)
    report = {
        "source": args.src, "output": args.dst,
        "settings": {"min": args.min, "pad": args.pad, "db": args.db},
        "before_sec": round(total, 2), "after_sec": round(new_total, 2),
        "keep": keep,
    }
    Path(args.dst).with_suffix(".cuts.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(f"쉼 {len(silences)}곳 · {total:.2f}초 → {new_total:.2f}초 · 남긴 구간 {len(keep)}개")


if __name__ == "__main__":
    main()
