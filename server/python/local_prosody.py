# -*- coding: utf-8 -*-
import argparse
import array
import json
import math
import sys
import time

from audio_common import analyze_audio_signal, debug_log, is_effectively_silent, sanitize_audio


if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def normalize_samples(raw_frames, sample_width):
    if sample_width != 2 or not raw_frames:
        return []
    samples = array.array('h')
    samples.frombytes(raw_frames)
    return [abs(sample) / 32768.0 for sample in samples]


def analyze_envelope(samples, frame_rate):
    if not samples or frame_rate <= 0:
        return {
            "speech_ratio": 0.0,
            "pause_count": 0,
            "average_pause_ms": 0,
            "energy_variation": 0.0,
            "speech_rate": 0.0,
            "warnings": ["No usable waveform samples."],
        }

    window_size = max(1, int(frame_rate * 0.05))
    energies = []
    for index in range(0, len(samples), window_size):
        window = samples[index:index + window_size]
        if not window:
            continue
        energies.append(sum(window) / len(window))

    if not energies:
        return {
            "speech_ratio": 0.0,
            "pause_count": 0,
            "average_pause_ms": 0,
            "energy_variation": 0.0,
            "speech_rate": 0.0,
            "warnings": ["Audio energy could not be estimated."],
        }

    peak = max(energies) or 1.0
    threshold = max(0.015, peak * 0.2)
    speech_windows = [energy >= threshold for energy in energies]
    speech_count = sum(1 for flag in speech_windows if flag)
    speech_ratio = speech_count / len(speech_windows)

    pause_lengths = []
    current_pause = 0
    transitions = 0
    in_speech = False
    for flag in speech_windows:
        if flag:
            if not in_speech:
                transitions += 1
            in_speech = True
            if current_pause > 0:
                pause_lengths.append(current_pause)
                current_pause = 0
        else:
            in_speech = False
            current_pause += 1

    if current_pause > 0:
        pause_lengths.append(current_pause)

    average_pause_ms = int(
        (sum(pause_lengths) / len(pause_lengths)) * 50
    ) if pause_lengths else 0
    mean_energy = sum(energies) / len(energies)
    variance = sum((energy - mean_energy) ** 2 for energy in energies) / len(energies)
    energy_variation = math.sqrt(variance)

    duration_seconds = len(samples) / frame_rate
    speech_rate = transitions / duration_seconds if duration_seconds > 0 else 0.0

    warnings = []
    if speech_ratio < 0.35:
        warnings.append("Speech ratio is low; long pauses or silence detected.")
    if average_pause_ms > 900:
        warnings.append("Average pause is long; rhythm may sound fragmented.")
    if speech_rate > 4.5:
        warnings.append("Speech rate appears high; rhythm may be rushed.")

    return {
        "speech_ratio": speech_ratio,
        "pause_count": len(pause_lengths),
        "average_pause_ms": average_pause_ms,
        "energy_variation": energy_variation,
        "speech_rate": speech_rate,
        "warnings": warnings,
    }


def score_from_features(duration_seconds, speech_ratio, average_pause_ms, energy_variation, speech_rate):
    duration_score = 100 if duration_seconds >= 1.2 else duration_seconds / 1.2 * 100
    pause_penalty = clamp((average_pause_ms - 350) / 12, 0, 35)
    ratio_score = clamp(speech_ratio * 130, 0, 100)
    rate_penalty = clamp(abs(speech_rate - 2.8) * 12, 0, 25)
    energy_bonus = clamp(energy_variation * 180, 0, 15)
    score = duration_score * 0.2 + ratio_score * 0.55 + (100 - pause_penalty) * 0.15 + (100 - rate_penalty) * 0.1
    score += energy_bonus
    return clamp(int(round(score)), 0, 100)


def confidence_from_features(score, warnings):
    confidence = score
    confidence -= min(20, len(warnings) * 8)
    return clamp(int(round(confidence)), 0, 100)


def build_summary(score, speech_ratio, average_pause_ms, speech_rate, warnings):
    summary_parts = [f"本地韵律评估分数约为 {score}。"]

    if speech_ratio < 0.35:
        summary_parts.append("有效发声占比较低，存在较长停顿。")
    elif speech_ratio > 0.7:
        summary_parts.append("整体连贯度较好。")

    if average_pause_ms > 900:
        summary_parts.append("停顿偏长，句子节奏略碎。")
    elif average_pause_ms < 250:
        summary_parts.append("停顿控制较紧。")

    if speech_rate > 4.5:
        summary_parts.append("语速偏快。")
    elif speech_rate < 1.6:
        summary_parts.append("语速偏慢。")

    if warnings:
        summary_parts.append("需要结合云端结果进一步确认。")

    return "".join(summary_parts)


def analyze_local_prosody(audio_path, ref_text=""):
    del ref_text
    start_time = time.time()
    sanitized_path = sanitize_audio(audio_path)
    signal_info = analyze_audio_signal(sanitized_path)

    if not signal_info:
        return {
            "status": "error",
            "score": 0,
            "confidence": 0,
            "summary": "",
            "duration_seconds": 0,
            "speech_ratio": 0,
            "pause_count": 0,
            "average_pause_ms": 0,
            "energy_variation": 0,
            "speech_rate": 0,
            "warnings": ["Audio signal analysis failed."],
            "message": "Unable to inspect audio signal."
        }

    if is_effectively_silent(signal_info):
        return {
            "status": "error",
            "score": 0,
            "confidence": 0,
            "summary": "未检测到有效语音。",
            "duration_seconds": signal_info["duration_seconds"],
            "speech_ratio": 0,
            "pause_count": 0,
            "average_pause_ms": 0,
            "energy_variation": 0,
            "speech_rate": 0,
            "warnings": ["No valid speech detected."],
            "message": "No valid speech detected in audio."
        }

    samples = normalize_samples(signal_info["raw_frames"], signal_info["sample_width"])
    features = analyze_envelope(samples, signal_info["frame_rate"])
    score = score_from_features(
        signal_info["duration_seconds"],
        features["speech_ratio"],
        features["average_pause_ms"],
        features["energy_variation"],
        features["speech_rate"],
    )
    confidence = confidence_from_features(score, features["warnings"])

    return {
        "status": "success",
        "score": score,
        "confidence": confidence,
        "summary": build_summary(
            score,
            features["speech_ratio"],
            features["average_pause_ms"],
            features["speech_rate"],
            features["warnings"],
        ),
        "duration_seconds": round(signal_info["duration_seconds"], 3),
        "speech_ratio": round(features["speech_ratio"] * 100),
        "pause_count": features["pause_count"],
        "average_pause_ms": features["average_pause_ms"],
        "energy_variation": round(features["energy_variation"] * 100),
        "speech_rate": round(features["speech_rate"], 2),
        "warnings": features["warnings"],
        "processing_time_ms": int((time.time() - start_time) * 1000),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', type=str, required=True)
    parser.add_argument('--ref_text', type=str, default="", help="Reference text for reading assessment")
    args = parser.parse_args()

    try:
        result = analyze_local_prosody(args.audio, args.ref_text)
    except Exception as exc:
        debug_log(f"Local prosody analysis failed: {exc}")
        result = {
            "status": "error",
            "score": 0,
            "confidence": 0,
            "summary": "",
            "duration_seconds": 0,
            "speech_ratio": 0,
            "pause_count": 0,
            "average_pause_ms": 0,
            "energy_variation": 0,
            "speech_rate": 0,
            "warnings": ["Local prosody analysis failed."],
            "message": str(exc)
        }

    print(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()
