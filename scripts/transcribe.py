"""한국어 받아쓰기: 문장·단어 시각 JSON, SRT, TXT를 저장한다.

맥(Apple 칩)은 mlx-whisper, 그 밖은 faster-whisper를 쓴다.
원문은 *.raw.* 로 보존하고, 고친 자막은 따로 만든다.

사용법:
  python3 transcribe.py <영상 또는 소리 파일> [--out transcripts/] [--lang ko]
"""
import argparse
import json
import platform
import sys
from pathlib import Path

MLX_MODEL = "mlx-community/whisper-large-v3-turbo"
FW_MODEL = "large-v3-turbo"


def fmt_srt(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def run_mlx(path: str, lang: str) -> list:
    import mlx_whisper

    result = mlx_whisper.transcribe(
        path, path_or_hf_repo=MLX_MODEL, language=lang, word_timestamps=True
    )
    return [
        {
            "start": s["start"],
            "end": s["end"],
            "text": s["text"].strip(),
            "words": [
                {"w": w["word"], "s": w["start"], "e": w["end"]}
                for w in s.get("words", [])
            ],
        }
        for s in result["segments"]
    ]


def run_faster(path: str, lang: str) -> list:
    from faster_whisper import WhisperModel

    model = WhisperModel(FW_MODEL, compute_type="int8")
    segments, _ = model.transcribe(path, language=lang, word_timestamps=True)
    return [
        {
            "start": s.start,
            "end": s.end,
            "text": s.text.strip(),
            "words": [{"w": w.word, "s": w.start, "e": w.end} for w in (s.words or [])],
        }
        for s in segments
    ]


def pick_engine():
    # Apple 칩 맥이면 mlx 우선, 안 되면 faster-whisper
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        try:
            import mlx_whisper  # noqa: F401

            return "mlx", run_mlx
        except ImportError:
            pass
    try:
        import faster_whisper  # noqa: F401

        return "faster-whisper", run_faster
    except ImportError:
        sys.exit(
            "받아쓰기 도구가 없어요. 맥(Apple 칩): pip3 install mlx-whisper / 그 밖: pip install faster-whisper"
        )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--out", default="transcripts")
    ap.add_argument("--lang", default="ko")
    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    name, engine = pick_engine()
    segs = engine(str(src), args.lang)

    # 시각은 소수 둘째 자리까지
    for s in segs:
        s["start"], s["end"] = round(s["start"], 2), round(s["end"], 2)
        for w in s["words"]:
            w["s"], w["e"] = round(w["s"], 2), round(w["e"], 2)

    stem = src.stem
    (out / f"{stem}.raw.json").write_text(
        json.dumps({"source": str(src), "engine": name, "segments": segs}, ensure_ascii=False, indent=1)
    )
    (out / f"{stem}.raw.txt").write_text("\n".join(s["text"] for s in segs) + "\n")
    srt = [
        f"{i}\n{fmt_srt(s['start'])} --> {fmt_srt(s['end'])}\n{s['text']}\n"
        for i, s in enumerate(segs, 1)
    ]
    (out / f"{stem}.raw.srt").write_text("\n".join(srt))

    for s in segs:
        print(f"[{s['start']:7.2f}-{s['end']:7.2f}] {s['text']}")
    print(f"\n엔진: {name} · 문장 {len(segs)}개 · 저장: {out}/{stem}.raw.*")


if __name__ == "__main__":
    main()
