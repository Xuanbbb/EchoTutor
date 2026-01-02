import sys
import json
import argparse
import time
import faulthandler

# Enable fault handler to dump stack trace on crash (e.g. segfault)
faulthandler.enable()

# Helper to print debug info to stderr so it doesn't corrupt stdout JSON
def debug_log(msg):
    sys.stderr.write(f"[Python] {msg}\n")
    sys.stderr.flush()

debug_log("Starting script initialization...")

# Force UTF-8 for stdout to avoid encoding errors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import torch
import torchaudio
from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
import numpy as np
import librosa

debug_log("Libraries loaded.")

def score_pronunciation(audio_path, reference_text=None):
    start_time = time.time()
    try:
        # 1. Load Model
        debug_log("Loading Wav2Vec2 model...")
        model_name = "facebook/wav2vec2-base-960h"
        processor = Wav2Vec2Processor.from_pretrained(model_name)
        model = Wav2Vec2ForCTC.from_pretrained(model_name)
        debug_log("Model loaded.")
        
        # 2. Load and Resample Audio
        debug_log(f"Loading audio file: {audio_path}")
        y, sr = librosa.load(audio_path, sr=16000)
        
        # Convert to torch tensor [1, num_samples]
        waveform = torch.from_numpy(y).unsqueeze(0)

        input_values = processor(waveform.squeeze().numpy(), return_tensors="pt", sampling_rate=16000).input_values

        # 3. Inference
        debug_log("Running inference...")
        with torch.no_grad():
            logits = model(input_values).logits

        # 4. Detailed Decoding & Scoring
        debug_log("Decoding results...")
        debug_log(f"Logits shape: {logits.shape}")
        
        if torch.isnan(logits).any():
            debug_log("WARNING: Logits contain NaNs!")

        debug_log("Calculating softmax...")
        probs = torch.nn.functional.softmax(logits, dim=-1)
        debug_log("Softmax calculated.")
        
        predicted_ids = torch.argmax(logits, dim=-1)[0]
        debug_log("Argmax calculated.")
        
        # Get the scores for the predicted tokens
        # logits shape: [batch, time, vocab] -> probs: [1, time, vocab]
        # We want the probability of the chosen token at each timestep
        confidence_scores = torch.gather(probs[0], 1, predicted_ids.unsqueeze(1)).squeeze()
        debug_log("Confidence scores gathered.")
        
        # Convert IDs to tokens
        # processor.tokenizer.convert_ids_to_tokens returns special tokens too
        
        # Wav2Vec2 CTC blank token is usually 0 or <pad>
        blank_id = processor.tokenizer.pad_token_id
        if blank_id is None:
             # Fallback usually 0 for CTC
             blank_id = 0
        
        debug_log(f"Blank ID: {blank_id}")

        token_details = []
        non_blank_scores = []
        
        debug_log("Starting token loop...")
        for i, (token_id, score) in enumerate(zip(predicted_ids, confidence_scores)):
            if token_id != blank_id:
                # debug_log(f"Processing token {i}") # Optional: extremely verbose
                char = processor.tokenizer.decode([token_id])
                score_val = score.item()
                non_blank_scores.append(score_val)
                token_details.append({
                    "char": char,
                    "score": round(score_val * 100, 2),
                    "step": i
                })
        debug_log("Token loop finished.")

        # Calculate average confidence only on non-blank frames
        if non_blank_scores:
            avg_confidence = sum(non_blank_scores) / len(non_blank_scores)
        else:
            avg_confidence = 0.0

        debug_log("Batch decoding transcription...")
        full_transcription = processor.batch_decode(predicted_ids.unsqueeze(0))[0]
        debug_log(f"Transcription finished: {full_transcription}")

        end_time = time.time()

        # 5. Result Construction
        result = {
            "status": "success",
            "recognized_text": full_transcription.lower(),
            "confidence_score": round(avg_confidence * 100, 2),
            "token_details": token_details,
            "processing_time_ms": round((end_time - start_time) * 1000, 2),
            "details": "Confidence score based on non-blank CTC frames."
        }
        
        debug_log("Preparing to print JSON result...")
        json_output = json.dumps(result)
        debug_log(f"JSON generated (len={len(json_output)}). Printing to stdout...")
        
        print(json_output)
        sys.stdout.flush() # Ensure Node.js gets it immediately
        debug_log("JSON printed and stdout flushed.")

    except Exception as e:
        debug_log(f"ERROR: {str(e)}")
        error_result = {
            "status": "error",
            "message": str(e)
        }
        print(json.dumps(error_result))
        sys.stdout.flush()

    debug_log("Exiting Python script.")
    sys.exit(0)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='EchoTutor Pronunciation Scorer')
    parser.add_argument('--audio', type=str, required=True, help='Path to the audio file')
    parser.add_argument('--text', type=str, required=False, help='Reference text (optional for now)')
    
    args = parser.parse_args()
    
    score_pronunciation(args.audio, args.text)