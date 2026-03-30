# -*- coding: utf-8 -*-
import audioop
import os
import subprocess
import sys
import wave


def debug_log(msg):
    sys.stderr.write(f"[Python] {msg}\n")
    sys.stderr.flush()


def load_env_value(*names):
    for name in names:
        value = os.getenv(name)
        if value:
            return value

    try:
        possible_env_paths = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
        ]
        for env_path in possible_env_paths:
            if not os.path.exists(env_path):
                continue
            with open(env_path, 'r', encoding='utf-8') as env_file:
                for line in env_file:
                    stripped = line.strip()
                    if not stripped or stripped.startswith('#') or '=' not in stripped:
                        continue
                    key, raw_value = stripped.split('=', 1)
                    if key.strip() in names:
                        return raw_value.strip()
    except Exception as exc:
        debug_log(f"Failed to load API key from .env: {exc}")

    return ""


def load_api_key():
    return load_env_value(
        "VOLCENGINE_SPEECH_API_KEY",
        "VOLCENGINE_API_KEY",
        "VOLCENGINE_ARK_API_KEY",
        "ARK_API_KEY",
        "DASHSCOPE_API_KEY",
    )


def sanitize_audio(audio_path: str) -> str:
    sanitized_path = audio_path + "_16k.wav"
    try:
        ffmpeg_bin = r'C:\ffmpeg-7.1.1-full_build\bin\ffmpeg.exe'
        if not os.path.exists(ffmpeg_bin):
            ffmpeg_bin = 'ffmpeg'

        debug_log(f"Sanitizing audio with FFmpeg ({ffmpeg_bin}): {audio_path} -> {sanitized_path}")
        cmd = [
            ffmpeg_bin, '-y', '-i', audio_path,
            '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-vn', sanitized_path
        ]
        process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if process.returncode != 0:
            debug_log(f"FFmpeg failed: {process.stderr.decode('utf-8', errors='ignore')}")
            return audio_path

        debug_log("FFmpeg conversion successful.")
        return sanitized_path
    except Exception as exc:
        debug_log(f"FFmpeg execution error: {exc}")
        return audio_path


def analyze_audio_signal(audio_path: str):
    try:
        with wave.open(audio_path, 'rb') as wav_file:
            frame_rate = wav_file.getframerate()
            frame_count = wav_file.getnframes()
            sample_width = wav_file.getsampwidth()
            raw_frames = wav_file.readframes(frame_count)

        duration_seconds = frame_count / frame_rate if frame_rate else 0
        rms = audioop.rms(raw_frames, sample_width) if raw_frames else 0
        max_amplitude = audioop.max(raw_frames, sample_width) if raw_frames else 0

        return {
            "frame_rate": frame_rate,
            "frame_count": frame_count,
            "sample_width": sample_width,
            "raw_frames": raw_frames,
            "duration_seconds": duration_seconds,
            "rms": rms,
            "max_amplitude": max_amplitude,
        }
    except Exception as exc:
        debug_log(f"Audio signal analysis failed: {exc}")
        return None


def is_effectively_silent(signal_info) -> bool:
    if not signal_info:
        return False

    rms = signal_info.get("rms", 0)
    max_amplitude = signal_info.get("max_amplitude", 0)

    return rms < 120 and max_amplitude < 800
