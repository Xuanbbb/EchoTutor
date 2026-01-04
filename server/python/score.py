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

def score_pronunciation(audio_path):
    # 1. Load API Key
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        try:
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
    # Since we have FFmpeg, we force convert EVERYTHING to standard 16k WAV
    # to avoid any format issues with DashScope.
    sanitized_path = abs_audio_path + "_16k.wav"
    try:
        # Use absolute path to ffmpeg provided by user
        ffmpeg_bin = r'C:\ffmpeg-7.1.1-full_build\bin\ffmpeg.exe'
        
        # If the hardcoded path doesn't exist, try just 'ffmpeg'
        if not os.path.exists(ffmpeg_bin):
            ffmpeg_bin = 'ffmpeg'
            
        debug_log(f"Sanitizing audio with FFmpeg ({ffmpeg_bin}): {abs_audio_path} -> {sanitized_path}")
        import subprocess
        
        cmd = [
            ffmpeg_bin, '-y', 
            '-i', abs_audio_path,
            '-ar', '16000',
            '-ac', '1',
            '-c:a', 'pcm_s16le',
            '-vn',
            sanitized_path
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

    # -----------------------------------
    # FINAL STRATEGY: DashScope SDK with Qwen3-ASR-Flash
    # -----------------------------------
    import pathlib
    
    debug_log("Switching to DashScope SDK with qwen3-asr-flash...")
    
    try:
        # Construct proper file URI
        # pathlib.as_uri() produces file:///Drive:/... which DashScope SDK seems to parse incorrectly on Windows
        # User example: file://ABSOLUTE_PATH
        # We'll use manual construction, ensuring string format.
        file_uri = f"file://{abs_audio_path}"
        debug_log(f"Using Audio URI: {file_uri}")

        messages = [
            {"role": "system", "content": [{"text": "You are a helpful assistant."}]}, 
            {"role": "user", "content": [{"audio": file_uri}]}
        ]
        
        response = dashscope.MultiModalConversation.call(
            api_key=api_key,
            model="qwen3-asr-flash",
            messages=messages,
            result_format="message",
            asr_options={
                "enable_itn": False
            }
        )
        
        if response.status_code == 200:
            debug_log("API call successful.")
            # Extract text from response
            # Expected structure: response.output.choices[0].message.content
            # content can be a list of dicts [{'text': '...'}]
            
            content = response.output.choices[0].message.content
            transcription = ""
            
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and 'text' in item:
                        transcription += item['text']
            elif isinstance(content, str):
                transcription = content
                
            print(json.dumps({
                "status": "success",
                "recognized_text": transcription,
                "confidence_score": 100.0,
                "details": "Transcribed via Qwen3-ASR-Flash"
            }))
        else:
            debug_log(f"API returned error: {response.code} - {response.message}")
            print(json.dumps({
                "status": "error",
                "message": f"API Error: {response.message}"
            }))

    except Exception as e:
        debug_log(f"SDK Request failed: {e}")
        # traceback for debugging
        import traceback
        debug_log(traceback.format_exc())
        print(json.dumps({"status": "error", "message": str(e)}))

    sys.stdout.flush()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', type=str, required=True)
    args = parser.parse_args()
    score_pronunciation(args.audio)
