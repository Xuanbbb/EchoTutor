# -*- coding: utf-8 -*-
import argparse
import json
import sys

from cloud_eval import evaluate_audio
from audio_common import debug_log


if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--audio', type=str, required=True)
    parser.add_argument('--ref_text', type=str, default="", help="Reference text for reading assessment")
    args = parser.parse_args()

    try:
        result = evaluate_audio(args.audio, args.ref_text)
    except Exception as exc:
        debug_log(f"Legacy score entry failed: {exc}")
        result = {
            "status": "error",
            "message": "Failed to get evaluation from audio model.",
            "details": str(exc)
        }

    print(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()
