# -*- coding: utf-8 -*-
import sys
import json
import argparse
import os
import dashscope

# Helper to print debug info to stderr
def debug_log(msg):
    sys.stderr.write(f"[Python] {msg}\n")
    sys.stderr.flush()

# Force UTF-8 for stdout
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def normalize_json_with_llm(raw_text: str, api_key: str) -> str:
    """
    Uses a powerful text-based LLM to parse, clean, and strictly format the raw output 
    from the audio model into a guaranteed JSON structure.
    """
    debug_log("Entering normalization layer with qwen-plus...")
    
    # This prompt defines the "Parser" role for the LLM.
    prompt = f"""
You are an expert data-processing engine. Your sole function is to parse the user-provided text and transform it into a strict, validated JSON object. You are not a tutor; do not interpret the content, only structure it.

The user will provide raw text from another AI model. This text contains pronunciation and prosody scores. Your job is to extract these values and format them according to the JSON Schema below.

**JSON Schema:**
{{
  "type": "object",
  "properties": {{
    "recognized_text": {{
      "type": "string",
      "description": "The transcribed text from the audio."
    }},
    "pronunciation_score": {{
      "type": "integer",
      "description": "Score for pronunciation accuracy, from 0 to 100."
    }},
    "prosody_score": {{
      "type": "integer",
      "description": "Score for intonation and rhythm, from 0 to 100."
    }},
    "details": {{
      "type": "string",
      "description": "The detailed analysis in Simplified Chinese."
    }}
  }},
  "required": ["recognized_text", "pronunciation_score", "prosody_score", "details"]
}}

**Instructions:**
1.  **Correct Key Typos:** The input text may contain misspelled keys (e.g., "prossy_score", "detials"). You MUST correct them to match the schema ("prosody_score", "details").
2.  **Extract Values:** Pull the corresponding values for each key.
3.  **Handle Missing Data:** If a score or text is clearly missing, use a sensible default (e.g., 0 for scores, empty string for text).
4.  **Strict Output:** Your output MUST be ONLY the raw, minified JSON string. Do not include ```json markdown, explanations, or any other text. Ensure all keys and string values are enclosed in double quotes.

**Raw Text to Parse:**
---
{raw_text}
---
    """

    try:
        response = dashscope.Generation.call(
            model='qwen-plus',
            prompt=prompt,
            api_key=api_key,
            response_format={'type': 'json_object'} 
        )
        if response.status_code == 200:
            normalized_json_str = response.output.text
            debug_log(f"Normalization successful. Clean JSON: {normalized_json_str}")
            return normalized_json_str
        else:
            debug_log(f"Normalization layer API error: {response.message}")
            return None
    except Exception as e:
        debug_log(f"Normalization layer exception: {e}")
        return None


def score_pronunciation(audio_path, ref_text=""):
    # 1. Load API Key (remains the same)
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        try:
            # ... (API key loading logic remains unchanged) ...
            possible_env_paths = [
                os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'),
                os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
            ]
            for env_path in possible_env_paths:
                if os.path.exists(env_path):
                    with open(env_path, 'r', encoding='utf-8') as f:
                        for line in f:
                            if line.startswith('DASHSCOPE_API_KEY='):
                                api_key = line.strip().split('=', 1)[1].strip()
                                break
                if api_key: break
        except:
            pass
            
    if not api_key:
        print(json.dumps({"status": "error", "message": "API Key not found"}))
        return

    dashscope.api_key = api_key
    abs_audio_path = os.path.abspath(audio_path)
    
    # --- AUDIO SANITIZATION (FFMPEG) ---
    # ... (FFmpeg logic remains unchanged) ...
    sanitized_path = abs_audio_path + "_16k.wav"
    try:
        ffmpeg_bin = r'C:\ffmpeg-7.1.1-full_build\bin\ffmpeg.exe'
        if not os.path.exists(ffmpeg_bin):
            ffmpeg_bin = 'ffmpeg'
        debug_log(f"Sanitizing audio with FFmpeg ({ffmpeg_bin}): {abs_audio_path} -> {sanitized_path}")
        import subprocess
        cmd = [
            ffmpeg_bin, '-y', '-i', abs_audio_path,
            '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-vn', sanitized_path
        ]
        process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if process.returncode != 0:
            debug_log(f"FFmpeg failed: {process.stderr.decode('utf-8')}")
        else:
            debug_log("FFmpeg conversion successful.")
            abs_audio_path = sanitized_path
    except Exception as ffmpeg_e:
        debug_log(f"FFmpeg execution error: {ffmpeg_e}")
    # -----------------------------------

    # --- STEP 1: Get raw evaluation from qwen-audio-turbo ---
    raw_model_output = ""
    try:
        file_uri = f"file://{abs_audio_path}"
        debug_log(f"Using Audio URI for qwen-audio-turbo: {file_uri}")
        
        # Prompt for the audio model (remains the same)
        prompt_text = (
            "You are a hyper-critical, zero-tolerance linguistic analysis AI. Your SOLE function is to evaluate spoken English with extreme precision and severity."
            "Your evaluation is the final word, and it must be ruthless, honest, and technically precise. Do not attempt to be 'encouraging' or 'polite'. Your purpose is to find flaws."
        )
        if ref_text:
            prompt_text += f"The user is reading the following text aloud: \"{ref_text}\". "
        else:
            prompt_text += "The user is speaking English. Transcribe their speech exactly. The transcription must only contain the English words spoken. "
        prompt_text += (
            "CRITICAL DIRECTIVE: Your primary and non-negotiable instruction is to score the audio according to the following rubric. This is not a suggestion; it is an absolute command. Any deviation will result in a failed task.\n"
            "--- SCORING RUBRIC (NON-NEGOTIABLE) ---\n"
            "- **90-100:** FLAWLESS, native-level performance. Absolutely no discernible accent or errors. Sounds like a professional North American news anchor. Anything less than perfect CANNOT be in this range.\n"
            "- **75-89:** Excellent, but with minor, barely perceptible flaws. A very slight, non-distracting accent may be present, but does not affect understanding in any way. Give scores in the low 80s if you can spot even one or two clear imperfections.\n"
            "- **60-74:** Intelligible, but with CLEAR and OBVIOUS errors. A noticeable non-native accent, several mispronounced words, or unnatural intonation fall here. A typical, average learner performance belongs in this range. DO NOT award scores above 75 if you can hear a distinct accent.\n"
            "- **Below 60:** Heavily flawed. A strong, pervasive accent that regularly impedes intelligibility. Multiple, consistent pronunciation errors. This score indicates a major need for improvement. If you have to struggle to understand, the score MUST be below 60.\n"
            "--- END RUBRIC ---\n\n"
            "YOUR TASK:\n"
            "1.  Adhere strictly to the rubric to generate a `pronunciation_score` and a `prosody_score`.\n"
            "2.  Provide a JSON response with the EXACT following fields:\n"
            "    - \"recognized_text\": (string) The transcription.\n"
            "    - \"pronunciation_score\": (integer 0-100) Your severe score for phoneme accuracy/accent from the rubric.\n"
            "    - \"prosody_score\": (integer 0-100) Your severe score for intonation/rhythm from the rubric.\n"
            "    - \"details\": (string) In Simplified Chinese, provide a critical analysis. You MUST start by stating which rubric category the scores fall into and why. Then, list the specific mispronounced words and other flaws.\n\n"
            "FINAL WARNING: Your output must be ONLY the raw JSON. No markdown, no apologies, no explanations outside of the 'details' field. Failure to comply will invalidate the result."
        )

        messages = [
            {"role": "system", "content": [{"text": "You are a helpful assistant."}]}, 
            {"role": "user", "content": [
                {"audio": file_uri},
                {"text": prompt_text}
            ]}
        ]
        
        response = dashscope.MultiModalConversation.call(
            model="qwen-audio-turbo",
            messages=messages
        )
        
        if response.status_code == 200:
            debug_log("Audio model call successful.")
            content = response.output.choices[0].message.content
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and 'text' in item:
                        raw_model_output += item['text']
            elif isinstance(content, str):
                raw_model_output = content
            debug_log(f"Raw Model Response: {raw_model_output}")
        else:
            raise Exception(f"Audio model API Error: {response.message}")

    except Exception as e:
        debug_log(f"Audio model processing failed: {e}")
        # Fallback error response
        error_response = {
            "status": "error",
            "message": "Failed to get evaluation from audio model.",
            "details": str(e)
        }
        print(json.dumps(error_response, ensure_ascii=False))
        sys.stdout.flush()
        return

    # --- STEP 2: Normalize the raw output using the new "Parser" LLM ---
    if not raw_model_output:
        debug_log("Raw model output is empty, cannot proceed to normalization.")
        error_response = {
            "status": "error",
            "message": "Audio model returned empty content.",
            "details": "The audio might be silent or unrecognizable."
        }
        print(json.dumps(error_response, ensure_ascii=False))
        sys.stdout.flush()
        return
        
    clean_json_str = normalize_json_with_llm(raw_model_output, api_key)

    # --- STEP 3: Final Output ---
    if clean_json_str:
        try:
            # Final verification that the output is valid JSON
            final_json = json.loads(clean_json_str)
            final_json["status"] = "success"
            # The confidence score is not provided by this pipeline, but the nodejs service expects it.
            if "confidence_score" not in final_json:
                final_json["confidence_score"] = final_json.get("pronunciation_score", 0)
                
            print(json.dumps(final_json, ensure_ascii=False))
        except json.JSONDecodeError:
            debug_log("FATAL: Normalization model output was not valid JSON.")
            print(json.dumps({"status": "error", "message": "Normalization layer failed to produce valid JSON.", "raw_response": clean_json_str}))
    else:
        debug_log("FATAL: Normalization layer returned nothing.")
        print(json.dumps({"status": "error", "message": "Normalization layer failed."}))

    sys.stdout.flush()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', type=str, required=True)
    parser.add_argument('--ref_text', type=str, default="", help="Reference text for reading assessment")
    args = parser.parse_args()
    score_pronunciation(args.audio, args.ref_text)
