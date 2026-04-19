# -*- coding: utf-8 -*-
import argparse
import array
import json
import math
import re
import sys
import time

from audio_common import analyze_audio_signal, debug_log, sanitize_audio


if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def normalize_tokens(text: str, language: str = "en-US"):
    value = (text or '').lower()
    if language in {"zh-CN", "ja-JP"}:
        return [char for char in re.sub(r"[^\w]", "", value) if char.strip()]

    return [
        token.strip()
        for token in re.sub(r"[^\w'\s]", ' ', value).split()
        if token.strip()
    ]


def build_alignment(reference_text: str, transcript: str, language: str = "en-US"):
    expected = normalize_tokens(reference_text, language)
    actual = normalize_tokens(transcript, language)

    if not expected and actual:
        return [{"expected": token, "actual": token, "status": "match"} for token in actual]

    rows = len(expected) + 1
    cols = len(actual) + 1
    dp = [[0] * cols for _ in range(rows)]

    for i in range(rows):
        dp[i][0] = i
    for j in range(cols):
        dp[0][j] = j

    for i in range(1, rows):
        for j in range(1, cols):
            substitution_cost = 0 if expected[i - 1] == actual[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + substitution_cost,
            )

    tokens = []
    i = len(expected)
    j = len(actual)
    while i > 0 or j > 0:
        expected_token = expected[i - 1] if i > 0 else ''
        actual_token = actual[j - 1] if j > 0 else ''

        if i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] and expected_token == actual_token:
            tokens.append({"expected": expected_token, "actual": actual_token, "status": "match"})
            i -= 1
            j -= 1
            continue

        if i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
            tokens.append({"expected": expected_token, "actual": actual_token, "status": "substituted"})
            i -= 1
            j -= 1
            continue

        if i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            tokens.append({"expected": expected_token, "actual": "", "status": "missing"})
            i -= 1
            continue

        tokens.append({"expected": "", "actual": actual_token, "status": "extra"})
        j -= 1

    tokens.reverse()
    return tokens


def normalize_samples(raw_frames, sample_width):
    if sample_width != 2 or not raw_frames:
        return []
    samples = array.array('h')
    samples.frombytes(raw_frames)
    return [sample / 32768.0 for sample in samples]


def extract_speech_segments(samples, frame_rate):
    if not samples or frame_rate <= 0:
        return []

    window_size = max(1, int(frame_rate * 0.05))
    energies = []
    for index in range(0, len(samples), window_size):
        window = samples[index:index + window_size]
        if not window:
            continue
        energies.append(sum(abs(value) for value in window) / len(window))

    if not energies:
        return []

    peak = max(energies) or 1.0
    threshold = max(0.015, peak * 0.2)
    segments = []
    start_index = None

    for idx, energy in enumerate(energies):
        is_speech = energy >= threshold
        if is_speech and start_index is None:
            start_index = idx
        if not is_speech and start_index is not None:
            segments.append({
                "start_ms": start_index * 50,
                "end_ms": idx * 50,
            })
            start_index = None

    if start_index is not None:
        segments.append({
            "start_ms": start_index * 50,
            "end_ms": len(energies) * 50,
        })

    return [segment for segment in segments if segment["end_ms"] > segment["start_ms"]]


def token_weight(token):
    base = token.get("actual") or token.get("expected") or ""
    normalized = re.sub(r"[^\w']", "", base.lower())
    return max(1.0, len(normalized) * 1.0)


def build_spoken_allocations(tokens, segments):
    spoken_tokens = [token for token in tokens if token.get("status") != "missing"]
    total_segment_ms = sum(segment["end_ms"] - segment["start_ms"] for segment in segments)

    if not spoken_tokens or total_segment_ms <= 0:
        return []

    total_weight = sum(token_weight(token) for token in spoken_tokens) or len(spoken_tokens)
    remaining_ms = total_segment_ms
    allocations = []
    current_segment_index = 0
    current_cursor_ms = segments[0]["start_ms"]

    for index, token in enumerate(spoken_tokens):
      weight = token_weight(token)
      if index == len(spoken_tokens) - 1:
          target_duration_ms = remaining_ms
      else:
          target_duration_ms = max(80.0, round(total_segment_ms * (weight / total_weight)))

      start_ms = current_cursor_ms
      duration_left = target_duration_ms

      while duration_left > 0 and current_segment_index < len(segments):
          segment = segments[current_segment_index]
          segment_end = segment["end_ms"]
          available = max(0, segment_end - current_cursor_ms)

          if available >= duration_left:
              current_cursor_ms += duration_left
              duration_left = 0
              break

          duration_left -= available
          current_segment_index += 1
          if current_segment_index < len(segments):
              current_cursor_ms = segments[current_segment_index]["start_ms"]
          else:
              current_cursor_ms = segment_end

      end_ms = current_cursor_ms
      allocations.append({
          "token": token,
          "start_ms": int(round(start_ms)),
          "end_ms": int(round(max(start_ms, end_ms))),
      })
      remaining_ms = max(0, remaining_ms - max(0, end_ms - start_ms))

    return allocations


def score_word(token, duration_ms):
    status = token.get("status")
    if status == "match":
        base = 86
    elif status == "substituted":
        base = 58
    elif status == "extra":
        base = 42
    else:
        base = 18

    if duration_ms is None:
        return base

    if duration_ms < 120:
        base -= 8
    elif duration_ms > 900:
        base -= 6
    elif 180 <= duration_ms <= 650:
        base += 4

    return max(0, min(100, int(round(base))))


def build_note(token, duration_ms):
    status = token.get("status")
    expected = token.get("expected", "")
    actual = token.get("actual", "")

    if status == "missing":
        return f'"{expected}" was not clearly found in the transcript.'
    if status == "substituted":
        return f'"{expected}" was recognized closer to "{actual}".'
    if status == "extra":
        return f'Extra spoken word "{actual}" was detected.'
    if duration_ms is not None and duration_ms < 120:
        return f'"{expected or actual}" sounded very short and may have been reduced.'
    return ""


def analyze_word_timing(audio_path, ref_text="", transcript="", language="en-US"):
    start_time = time.time()
    sanitized_path = sanitize_audio(audio_path)
    signal_info = analyze_audio_signal(sanitized_path)
    alignment_tokens = build_alignment(ref_text, transcript, language)

    if not signal_info:
        return {
            "status": "error",
            "summary": "Unable to inspect audio for word timing.",
            "words": [],
            "message": "Audio signal analysis failed.",
        }

    samples = normalize_samples(signal_info["raw_frames"], signal_info["sample_width"])
    segments = extract_speech_segments(samples, signal_info["frame_rate"])
    allocations = build_spoken_allocations(alignment_tokens, segments)

    allocation_lookup = {}
    for item in allocations:
        token = item["token"]
        key = (token.get("expected", ""), token.get("actual", ""), token.get("status", ""))
        allocation_lookup.setdefault(key, []).append(item)

    words = []
    low_score_count = 0
    for token in alignment_tokens:
        key = (token.get("expected", ""), token.get("actual", ""), token.get("status", ""))
        allocation = allocation_lookup.get(key, [])
        next_allocation = allocation.pop(0) if allocation else None
        if allocation is not None:
            allocation_lookup[key] = allocation

        start_ms = next_allocation["start_ms"] if next_allocation else None
        end_ms = next_allocation["end_ms"] if next_allocation else None
        duration_ms = (end_ms - start_ms) if start_ms is not None and end_ms is not None else None
        score = score_word(token, duration_ms)
        if score < 60:
            low_score_count += 1

        words.append({
            "expected": token.get("expected", ""),
            "actual": token.get("actual", ""),
            "status": token.get("status", "missing"),
            "start_ms": start_ms,
            "end_ms": end_ms,
            "score": score,
            "note": build_note(token, duration_ms),
        })

    if not words:
        summary = "No aligned words were available for timing."
        status = "error"
    else:
        summary = f"Estimated timing for {len(words)} aligned words. {low_score_count} words look less stable."
        status = "success"

    return {
        "status": status,
        "summary": summary,
        "words": words,
        "processing_time_ms": int((time.time() - start_time) * 1000),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', type=str, required=True)
    parser.add_argument('--ref_text', type=str, default="")
    parser.add_argument('--transcript', type=str, default="")
    parser.add_argument('--language', type=str, default="en-US")
    args = parser.parse_args()

    try:
        result = analyze_word_timing(args.audio, args.ref_text, args.transcript, args.language)
    except Exception as exc:
        debug_log(f"Word timing analysis failed: {exc}")
        result = {
            "status": "error",
            "summary": "",
            "words": [],
            "message": str(exc),
        }

    print(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()
