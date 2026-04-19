# -*- coding: utf-8 -*-
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid

from audio_common import (
    analyze_audio_signal,
    debug_log,
    is_effectively_silent,
    load_api_key,
    load_env_value,
    sanitize_audio,
)


if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


SUPPORTED_LANGUAGE_HINTS = {"en-US", "zh-CN", "ko-KR", "ja-JP", "es-ES", "fr-FR"}


def normalize_language(language: str, reference_text: str) -> str:
    if language in SUPPORTED_LANGUAGE_HINTS:
        return language
    if language == "auto":
        return infer_language_hint(reference_text)
    return infer_language_hint(reference_text)


def infer_language_hint(reference_text: str) -> str:
    text = (reference_text or '').strip()
    if not text:
        return 'en-US'

    chinese_count = len(re.findall(r'[\u4e00-\u9fff]', text))
    japanese_count = len(re.findall(r'[\u3040-\u30ff]', text))
    korean_count = len(re.findall(r'[\uac00-\ud7af]', text))
    latin_count = len(re.findall(r'[A-Za-zÀ-ÖØ-öø-ÿ]', text))

    if korean_count > 0 and korean_count >= latin_count:
        return 'ko-KR'
    if japanese_count > 0 and japanese_count >= latin_count:
        return 'ja-JP'
    if chinese_count > latin_count * 1.5:
        return 'zh-CN'
    if latin_count > chinese_count * 1.5:
        return 'en-US'
    return 'en-US'


def normalize_tokens(text: str, language: str = "en-US"):
    value = (text or '').lower()
    if language in {"zh-CN", "ja-JP"}:
        return [char for char in re.sub(r"[^\w]", "", value) if char.strip()]
    return [
        token.strip()
        for token in re.sub(r"[^\w'\s]", ' ', value).split()
        if token.strip()
    ]


def build_alignment(reference_text: str, recognized_text: str, language: str = "en-US"):
    expected = normalize_tokens(reference_text, language)
    actual = normalize_tokens(recognized_text, language)

    if not expected and not actual:
        return {"mismatch_count": 0, "match_count": 0, "expected_count": 0, "actual_count": 0}

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

    mismatch_count = dp[-1][-1]
    max_token_count = max(len(expected), len(actual), 1)
    match_count = max(0, max_token_count - mismatch_count)

    return {
        "mismatch_count": mismatch_count,
        "match_count": match_count,
        "expected_count": len(expected),
        "actual_count": len(actual),
    }


def clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def score_pronunciation(reference_text: str, recognized_text: str, language: str = "en-US"):
    recognized_text = (recognized_text or '').strip()
    if not recognized_text:
        return 0, "未检测到清晰可识别的语音内容。"

    if not (reference_text or '').strip():
        return 68, "已完成语音识别。当前发音分主要反映表达清晰度，建议结合识别结果继续优化咬字和节奏。"

    alignment = build_alignment(reference_text, recognized_text, language)
    expected_count = alignment["expected_count"]
    actual_count = alignment["actual_count"]
    mismatch_count = alignment["mismatch_count"]
    match_count = alignment["match_count"]

    base = max(expected_count, actual_count, 1)
    accuracy_ratio = max(0.0, 1.0 - mismatch_count / base)
    coverage_ratio = match_count / max(expected_count, 1)
    score = clamp_score(accuracy_ratio * 75 + coverage_ratio * 25)

    if mismatch_count == 0:
        detail = "识别文本与参考文本完全一致，发音清晰度较好。"
    else:
        detail = (
            f"识别文本与参考文本存在 {mismatch_count} 处词级偏差，"
            "当前发音分主要依据识别一致性保守估计。"
        )

    return score, detail


def transcribe_with_volcengine(audio_path: str, reference_text: str = "", language: str = "en-US") -> str:
    base_url = load_env_value("VOLCENGINE_SPEECH_BASE_URL") or "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
    resource_id = load_env_value("VOLCENGINE_SPEECH_RESOURCE_ID") or "volc.bigasr.auc_turbo"
    api_key = load_env_value("VOLCENGINE_SPEECH_API_KEY", "VOLCENGINE_API_KEY")
    app_id = load_env_value("VOLCENGINE_SPEECH_APP_ID", "VOLCENGINE_APP_ID")
    access_key = load_env_value("VOLCENGINE_SPEECH_ACCESS_KEY", "VOLCENGINE_ACCESS_KEY")

    if not api_key and not (app_id and access_key):
        raise Exception("Volcengine OpenSpeech credentials not found.")

    with open(audio_path, "rb") as audio_file:
        audio_base64 = base64.b64encode(audio_file.read()).decode("ascii")

    headers = {
        "Content-Type": "application/json",
        "X-Api-Resource-Id": resource_id,
        "X-Api-Request-Id": str(uuid.uuid4()),
        "X-Api-Sequence": "-1",
    }
    if api_key:
        headers["x-api-key"] = api_key
    if app_id:
        headers["X-Api-App-Key"] = app_id
    if access_key:
        headers["X-Api-Access-Key"] = access_key

    payload = {
        "user": {
            "uid": app_id or "EchoTutor"
        },
        "audio": {
            "data": audio_base64,
            **({"language": normalize_language(language, reference_text)} if normalize_language(language, reference_text) else {})
        },
        "request": {
            "model_name": "bigmodel",
            "enable_itn": True,
            "enable_punc": False,
            "show_utterances": False,
            "vad_segment": False,
        }
    }

    request = urllib.request.Request(
        base_url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            response_body = response.read().decode("utf-8", errors="ignore")
            status_code = response.headers.get("X-Api-Status-Code", "20000000")
            status_message = response.headers.get("X-Api-Message", "")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise Exception(f"Volcengine OpenSpeech HTTP {exc.code}: {error_body}")
    except urllib.error.URLError as exc:
        raise Exception(f"Volcengine OpenSpeech network error: {exc}")

    debug_log(f"Volcengine OpenSpeech response preview: {response_body[:500]}")

    if str(status_code) != "20000000":
        raise Exception(f"Volcengine OpenSpeech status {status_code}: {status_message}")

    parsed = json.loads(response_body)
    transcript = (((parsed.get("result") or {}).get("text")) or "").strip()
    if not transcript:
        raise Exception(f"Volcengine OpenSpeech returned an empty transcript: {response_body[:1000]}")
    return transcript


def build_dashscope_prompt(language_hint: str) -> str:
    if language_hint == 'en-US':
        return (
            "Transcribe the audio faithfully in English only. "
            "If the speaker has a Korean, Japanese, Chinese, Spanish, or French accent but is speaking English, output the intended English words. "
            "Do not translate, do not output Korean, Japanese, or Chinese characters, and do not mix other languages into English output. "
            "Return only the transcript text."
        )
    if language_hint == 'zh-CN':
        return (
            "Transcribe the audio faithfully in Simplified Chinese only. "
            "Do not translate, do not insert English unless it is clearly spoken, and return only the transcript text."
        )
    if language_hint == 'ko-KR':
        return (
            "Transcribe the audio faithfully in Korean only. "
            "Do not translate, do not romanize Korean, and return only the transcript text in Hangul when Korean is spoken."
        )
    if language_hint == 'ja-JP':
        return (
            "Transcribe the audio faithfully in Japanese only. "
            "Do not translate, do not romanize Japanese, and return only the transcript text in Japanese script."
        )
    if language_hint == 'es-ES':
        return (
            "Transcribe the audio faithfully in Spanish only. "
            "Do not translate, do not insert other languages, and return only the transcript text."
        )
    if language_hint == 'fr-FR':
        return (
            "Transcribe the audio faithfully in French only. "
            "Do not translate, do not insert other languages, and return only the transcript text."
        )
    return (
        "Transcribe the audio faithfully in the language actually spoken. "
        "Do not translate. Return only the transcript text."
    )


def transcribe_with_dashscope(audio_path: str, reference_text: str = "", language: str = "en-US") -> str:
    api_key = load_api_key()
    if not api_key:
        raise Exception("DashScope API key not found.")

    with open(audio_path, "rb") as audio_file:
        audio_base64 = base64.b64encode(audio_file.read()).decode("ascii")

    language_hint = normalize_language(language, reference_text)
    payload = {
        "model": load_env_value("DASHSCOPE_ASR_MODEL") or "qwen3-asr-flash",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": f"data:audio/wav;base64,{audio_base64}",
                        },
                    },
                    {
                        "type": "text",
                        "text": build_dashscope_prompt(language_hint),
                    },
                ],
            }
        ],
        "stream": False,
    }

    request = urllib.request.Request(
        load_env_value("DASHSCOPE_BASE_URL") or "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            response_body = response.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise Exception(f"DashScope speech HTTP {exc.code}: {error_body}")
    except urllib.error.URLError as exc:
        raise Exception(f"DashScope speech network error: {exc}")

    parsed = json.loads(response_body)
    content = parsed.get("choices", [{}])[0].get("message", {}).get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return ''.join(
            item.get("text", "")
            for item in content
            if isinstance(item, dict)
        ).strip()
    return ""


def transcribe_audio(audio_path: str, reference_text: str = "", language: str = "en-US") -> str:
    if load_env_value("VOLCENGINE_SPEECH_API_KEY", "VOLCENGINE_API_KEY") or (
        load_env_value("VOLCENGINE_SPEECH_APP_ID", "VOLCENGINE_APP_ID")
        and load_env_value("VOLCENGINE_SPEECH_ACCESS_KEY", "VOLCENGINE_ACCESS_KEY")
    ):
        return transcribe_with_volcengine(audio_path, reference_text, language)
    return transcribe_with_dashscope(audio_path, reference_text, language)


def evaluate_audio(audio_path, ref_text="", language="en-US"):
    start_time = time.time()

    abs_audio_path = sanitize_audio(audio_path)
    signal_info = analyze_audio_signal(abs_audio_path)

    if is_effectively_silent(signal_info):
        return {
            "status": "error",
            "message": "No valid speech detected in audio.",
            "details": "Audio is near silent or no valid speech was detected. Please record again."
        }

    language_hint = normalize_language(language, ref_text)
    recognized_text = transcribe_audio(abs_audio_path, ref_text, language_hint)
    pronunciation_score, details = score_pronunciation(ref_text, recognized_text, language_hint)

    result = {
        "status": "success" if recognized_text.strip() else "error",
        "recognized_text": recognized_text.strip(),
        "pronunciation_score": pronunciation_score,
        "prosody_score": pronunciation_score,
        "details": details,
        "confidence_score": pronunciation_score,
        "processing_time_ms": int((time.time() - start_time) * 1000),
        "raw_response": recognized_text[:1000],
    }

    if not recognized_text.strip():
        result["message"] = "Speech provider returned an empty transcript."

    debug_log(f"Cloud evaluation normalized result: {json.dumps(result, ensure_ascii=False)[:1000]}")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', type=str, required=True)
    parser.add_argument('--ref_text', type=str, default="", help="Reference text for reading assessment")
    parser.add_argument('--language', type=str, default="en-US", help="Practice language code")
    args = parser.parse_args()

    try:
        result = evaluate_audio(args.audio, args.ref_text, args.language)
    except Exception as exc:
        debug_log(f"Cloud evaluation failed: {exc}")
        result = {
            "status": "error",
            "message": "Failed to get evaluation from speech provider.",
            "details": str(exc),
            "raw_response": ""
        }

    print(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()
