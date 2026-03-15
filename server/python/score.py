# -*- coding: utf-8 -*-
import sys
import json
import argparse
import os
import re
import wave
import audioop
import subprocess

import dashscope


def debug_log(msg):
    sys.stderr.write(f"[Python] {msg}\n")
    sys.stderr.flush()


if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


FIELD_ALIASES = {
    "recognized_text": [
        "recognized_text", "recognizedtext", "transcription", "transcribed_text",
        "text", "recognized text"
    ],
    "pronunciation_score": [
        "pronunciation_score", "pronunciationscore", "pronunciation", "score",
        "pron_score", "pronunciation score"
    ],
    "prosody_score": [
        "prosody_score", "prossy_score", "prossody_score", "prosodyscore",
        "prosody", "fluency_score", "prosody score"
    ],
    "details": [
        "details", "detail", "detials", "analysis", "feedback",
        "comment", "comments", "details_cn"
    ],
}


def canonical_key(key: str) -> str:
    normalized = re.sub(r'[^a-z_ ]', '', key.lower()).strip()
    for target, aliases in FIELD_ALIASES.items():
        if normalized in aliases:
            return target
    return normalized.replace(' ', '_')


def coerce_score(value) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return max(0, min(100, int(round(value))))

    match = re.search(r'-?\d+(?:\.\d+)?', str(value))
    if not match:
        return 0
    return max(0, min(100, int(round(float(match.group(0))))))


def strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r'^```[a-zA-Z]*\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    return cleaned.strip()


def try_parse_json_block(raw_text: str):
    cleaned = strip_code_fences(raw_text)

    try:
        return json.loads(cleaned)
    except Exception:
        pass

    start = cleaned.find('{')
    end = cleaned.rfind('}')
    if start != -1 and end != -1 and end > start:
        candidate = cleaned[start:end + 1]
        try:
            return json.loads(candidate)
        except Exception:
            return None
    return None


def extract_value_from_text(raw_text: str, aliases) -> str:
    for alias in aliases:
        pattern = re.compile(
            rf'["\']?{re.escape(alias)}["\']?\s*[:=]\s*(".*?"|\'.*?\'|[^\n,}}]+)',
            re.IGNORECASE | re.DOTALL
        )
        match = pattern.search(raw_text)
        if not match:
            continue
        value = match.group(1).strip().strip(',').strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        return value.strip()
    return ""


def normalize_model_output(raw_text: str):
    debug_log("Normalizing audio-model output with deterministic parser...")
    parsed = try_parse_json_block(raw_text)

    normalized = {
        "recognized_text": "",
        "pronunciation_score": 0,
        "prosody_score": 0,
        "details": ""
    }

    if isinstance(parsed, dict):
        for key, value in parsed.items():
            mapped_key = canonical_key(str(key))
            if mapped_key not in normalized:
                continue
            if mapped_key in ("recognized_text", "details"):
                normalized[mapped_key] = "" if value is None else str(value).strip()
            else:
                normalized[mapped_key] = coerce_score(value)
    else:
        normalized["recognized_text"] = extract_value_from_text(raw_text, FIELD_ALIASES["recognized_text"])
        normalized["details"] = extract_value_from_text(raw_text, FIELD_ALIASES["details"])
        normalized["pronunciation_score"] = coerce_score(
            extract_value_from_text(raw_text, FIELD_ALIASES["pronunciation_score"])
        )
        normalized["prosody_score"] = coerce_score(
            extract_value_from_text(raw_text, FIELD_ALIASES["prosody_score"])
        )

    if not normalized["details"]:
        fallback = strip_code_fences(raw_text)
        normalized["details"] = fallback[:2000]

    return normalized


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

    duration_seconds = signal_info.get("duration_seconds", 0)
    rms = signal_info.get("rms", 0)
    max_amplitude = signal_info.get("max_amplitude", 0)

    if duration_seconds < 0.35:
        return True

    if rms < 120 and max_amplitude < 800:
        return True

    return False


def load_api_key():
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if api_key:
        return api_key

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
                    if line.startswith('DASHSCOPE_API_KEY='):
                        return line.strip().split('=', 1)[1].strip()
    except Exception as exc:
        debug_log(f"Failed to load API key from .env: {exc}")

    return ""


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


def build_prompt(ref_text: str) -> str:
    prompt = (
        "You are a strict spoken-English evaluation engine. "
        "Your job is to listen to the audio and produce a JSON result. "
        "You must rely on the audio first.\n\n"
    )

    if ref_text:
        prompt += (
            f'Reference text: "{ref_text}"\n'
            "The reference text is only auxiliary context. "
            "You must never reconstruct, infer, autocomplete, or copy the reference text unless the audio clearly supports it. "
            "If the audio is silent, too quiet, too short, or unintelligible, you must treat it as no valid speech.\n\n"
        )
    else:
        prompt += (
            "There is no reference text. "
            "Transcribe only the words that are clearly present in the audio.\n\n"
        )

    prompt += (
        "Return ONLY one raw JSON object with exactly these fields:\n"
        "- recognized_text: string\n"
        "- pronunciation_score: integer 0-100\n"
        "- prosody_score: integer 0-100\n"
        "- details: string in Simplified Chinese\n\n"
        "Rules:\n"
        "1. If there is no clear speech, set recognized_text to an empty string.\n"
        "2. If there is no clear speech, set pronunciation_score to 0 and prosody_score to 0.\n"
        "3. If there is no clear speech, details must explicitly say in Simplified Chinese that no valid speech was detected.\n"
        "4. Never guess missing words from the reference text.\n"
        "5. Never output markdown or extra explanation outside the JSON object.\n"
    )
    return prompt


def call_audio_model(audio_path: str, ref_text: str) -> str:
    file_uri = f"file://{audio_path}"
    debug_log(f"Using audio URI for qwen3-omni-flash: {file_uri}")

    messages = [
        {"role": "system", "content": [{"text": "You are a helpful assistant."}]},
        {"role": "user", "content": [
            {"audio": file_uri},
            {"text": build_prompt(ref_text)}
        ]}
    ]

    response = dashscope.MultiModalConversation.call(
        model="qwen3-omni-flash",
        messages=messages
    )

    if response.status_code != 200:
        raise Exception(f"Audio model API Error: {response.message}")

    content = response.output.choices[0].message.content
    raw_model_output = ""
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and 'text' in item:
                raw_model_output += item['text']
    elif isinstance(content, str):
        raw_model_output = content

    debug_log(f"Raw Model Response: {raw_model_output}")
    return raw_model_output


def score_pronunciation(audio_path, ref_text=""):
    api_key = load_api_key()
    if not api_key:
        print(json.dumps({"status": "error", "message": "API Key not found"}))
        return

    dashscope.api_key = api_key
    abs_audio_path = os.path.abspath(audio_path)
    abs_audio_path = sanitize_audio(abs_audio_path)

    signal_info = analyze_audio_signal(abs_audio_path)
    if signal_info:
        debug_log(
            "Audio signal stats - "
            f"duration={signal_info['duration_seconds']:.3f}s, "
            f"rms={signal_info['rms']}, "
            f"max_amplitude={signal_info['max_amplitude']}"
        )

    if is_effectively_silent(signal_info):
        debug_log("Audio rejected before model call because it appears silent or too short.")
        print(json.dumps({
            "status": "error",
            "message": "No valid speech detected in audio.",
            "details": "音频接近静音、时长过短，或未检测到有效语音。请重新录音后再试。"
        }, ensure_ascii=False))
        sys.stdout.flush()
        return

    raw_model_output = ""
    try:
        raw_model_output = call_audio_model(abs_audio_path, ref_text)
    except Exception as exc:
        debug_log(f"Audio model processing failed: {exc}")
        print(json.dumps({
            "status": "error",
            "message": "Failed to get evaluation from audio model.",
            "details": str(exc)
        }, ensure_ascii=False))
        sys.stdout.flush()
        return

    if not raw_model_output:
        debug_log("Raw model output is empty, cannot proceed to normalization.")
        print(json.dumps({
            "status": "error",
            "message": "Audio model returned empty content.",
            "details": "The audio might be silent or unrecognizable."
        }, ensure_ascii=False))
        sys.stdout.flush()
        return

    try:
        final_json = normalize_model_output(raw_model_output)
        final_json["status"] = "success"
        final_json["confidence_score"] = final_json.get("pronunciation_score", 0)
        print(json.dumps(final_json, ensure_ascii=False))
    except Exception as parse_error:
        debug_log(f"FATAL: Deterministic normalization failed: {parse_error}")
        print(json.dumps({
            "status": "error",
            "message": "Normalization layer failed.",
            "raw_response": raw_model_output
        }, ensure_ascii=False))

    sys.stdout.flush()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', type=str, required=True)
    parser.add_argument('--ref_text', type=str, default="", help="Reference text for reading assessment")
    args = parser.parse_args()
    score_pronunciation(args.audio, args.ref_text)
