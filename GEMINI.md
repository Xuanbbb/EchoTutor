# EchoTutor Project Context

## Project Overview

**EchoTutor** is an intelligent oral English practice system designed to help users improve their spoken English through comprehensive AI-driven feedback. The project is structured as a mono-repo containing a desktop client, a Node.js backend server, and a Python-based pronunciation assessment engine.

### Architecture

*   **Client**: A cross-platform desktop application built with **Electron**, **React**, and **TypeScript** (bundled via **Vite**). It handles user interaction, audio recording, playback, and result visualization.
*   **Server**: A **Node.js** and **Express** application (TypeScript) that orchestrates audio processing, manages AI service integrations, and returns comprehensive evaluation results.
*   **Python Sidecar**: A Python script (`score.py`) that performs real-time pronunciation assessment using local AI models.

### Key Technologies

*   **Frontend**: React 19, Vite, Electron, `react-media-recorder`, Axios
*   **Backend**: Express.js, Multer (file handling), Axios, Child Process (Python integration)
*   **Python Engine**: FunASR (SenseVoice model for ASR), Funasr-Onnx (pronunciation assessment)
*   **AI Integration**: 
    *   **ASR**: Aliyun DashScope `qwen3-asr-flash` model (OpenAI-compatible API)
    *   **LLM**: Aliyun DashScope `qwen-plus` model for grammar correction and feedback
    *   **TTS**: Aliyun DashScope `qwen3-tts-flash` model for pronunciation playback
    *   **Pronunciation Scoring**: Local Python-based FunASR models

## Directory Structure

```
E:\EchoTutor\
├── client/                 # Frontend Electron application
│   ├── electron/           # Electron main process files
│   │   └── main.ts         # Main process entry point
│   ├── src/                # React renderer process files
│   │   ├── components/     # UI Components
│   │   │   ├── AudioRecorder.tsx    # Main audio recording & evaluation UI
│   │   │   └── AudioRecorder.css    # Component styles
│   │   ├── App.tsx         # Root React component
│   │   └── index.css       # Global styles
│   ├── vite.config.ts      # Vite configuration with Electron plugin
│   └── package.json
├── server/                 # Backend API service
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   │   └── AudioController.ts   # Audio processing & TTS endpoints
│   │   ├── services/       # Business logic services
│   │   │   ├── ASRService.ts        # Speech-to-text (DashScope)
│   │   │   ├── LLMService.ts        # Grammar & feedback (DashScope)
│   │   │   ├── TTSService.ts        # Text-to-speech (DashScope)
│   │   │   └── ScoringService.ts    # Python sidecar integration
│   │   └── index.ts        # Server entry point
│   ├── python/             # Python pronunciation engine
│   │   ├── score.py        # FunASR-based pronunciation assessment
│   │   └── requirements.txt
│   ├── .env                # Environment variables (API Keys)
│   └── package.json
└── README.md               # Original project requirements document
```

## Core Features

### 1. Audio Recording & Upload
- Real-time audio recording using browser MediaRecorder API
- File upload support for debugging and testing
- Audio playback preview before submission

### 2. Speech Recognition (ASR)
- **Primary**: Aliyun DashScope `qwen3-asr-flash` via OpenAI-compatible API
- Audio preprocessing with FFmpeg (16kHz mono WAV conversion)
- Supports English language recognition with ITN (Inverse Text Normalization) options

### 3. Pronunciation Assessment
- **Local Python Engine**: FunASR SenseVoice + Funasr-Onnx models
- Provides detailed metrics:
  - Pronunciation score (0-100)
  - Prosody score (rhythm and intonation)
  - Token-level pronunciation details
  - Recognized text with confidence scores
- Runs as a child process spawned by Node.js server

### 4. AI-Powered Feedback
- **Grammar Analysis**: Identifies grammatical errors and provides corrections
- **Pronunciation Advice**: Specific feedback on pronunciation issues
- **Better Expression**: Suggests improved ways to express the same idea
- **Overall Score**: Comprehensive evaluation (0-100)

### 5. Text-to-Speech (TTS)
- Aliyun DashScope `qwen3-tts-flash` model
- Plays correct pronunciation of suggested expressions
- Downloads audio from DashScope OSS storage
- Supports Chinese voice (`longxiaochun`)

## Setup and Development

### Prerequisites

*   Node.js (v18+ recommended)
*   Python 3.8+ (for pronunciation assessment)
*   npm
*   FFmpeg (for audio conversion)
*   Aliyun DashScope API Key

### Backend Setup (`server/`)

1.  Navigate to the server directory:
    ```bash
    cd server
    ```

2.  Install Node.js dependencies:
    ```bash
    npm install
    ```

3.  Install Python dependencies:
    ```bash
    cd python
    pip install -r requirements.txt
    cd ..
    ```

4.  Configure environment variables:
    *   Create `.env` file in `server/` directory
    *   Required variable: `DASHSCOPE_API_KEY=sk-xxxxxxxx...`

5.  Ensure FFmpeg is installed:
    *   Windows: Download from [ffmpeg.org](https://ffmpeg.org) and add to PATH
    *   Or specify path in `ASRService.ts` (line 33)

6.  Start the development server:
    ```bash
    npm run dev
    ```
    *   Runs on `http://localhost:3000`
    *   Health check: `http://localhost:3000/api/health`

### Client Setup (`client/`)

1.  Navigate to the client directory:
    ```bash
    cd client
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the desktop application:
    ```bash
    npm run dev
    ```
    *   This will launch the Electron window with hot-reload enabled

## API Endpoints

### `POST /api/process-audio`
Processes uploaded audio and returns comprehensive evaluation.

**Request:**
- Content-Type: `multipart/form-data`
- Body: 
  - `audio`: Audio file (Blob/File)
  - `referenceText`: (Optional) Reference text for comparison

**Response:**
```json
{
  "transcription": "recognized text",
  "scoring": {
    "status": "success",
    "recognized_text": "...",
    "pronunciation_score": 85,
    "prosody_score": 78,
    "confidence_score": 0.95,
    "token_details": [...],
    "processing_time_ms": 1234
  },
  "evaluation": {
    "score": 82,
    "grammarIssues": ["..."],
    "pronunciationFeedback": ["..."],
    "correction": "suggested better expression"
  }
}
```

### `POST /api/tts-generate`
Generates audio from text using TTS.

**Request:**
```json
{
  "text": "Text to convert to speech"
}
```

**Response:**
- Content-Type: `audio/mpeg` or `audio/wav`
- Body: Audio file binary data

## Development Conventions

*   **Language**: TypeScript is used for both client and server
*   **Architecture Pattern**: 
    *   Backend follows a Controller-Service pattern
    *   Frontend uses functional React components with Hooks
*   **Audio Processing Pipeline**:
    1. Client records audio as `blob` via `react-media-recorder`
    2. Client uploads via `FormData` (`multipart/form-data`) to `/api/process-audio`
    3. Server receives via `multer` (memory storage)
    4. Audio is transcoded with FFmpeg to 16kHz mono WAV
    5. Parallel processing:
       - ASR via DashScope API
       - Pronunciation scoring via Python sidecar
    6. LLM evaluation of transcribed text
    7. Results aggregated and returned to client
*   **AI Service Integration**:
    *   All DashScope services use HTTP REST APIs (not SDK) to avoid TypeScript type issues
    *   Python sidecar communicates via stdout/stderr JSON
    *   TTS audio is downloaded from OSS URLs provided by DashScope

## Technical Highlights

### 1. Multi-Model AI Pipeline
- Combines cloud-based ASR/LLM/TTS with local pronunciation models
- Parallel processing for faster response times
- Graceful fallback handling when services fail

### 2. Python-Node.js Integration
- Spawns Python child process for pronunciation assessment
- Streams stderr for real-time progress (model download, etc.)
- Early JSON parsing to reduce latency
- 2-minute timeout for first-run model downloads

### 3. Audio Format Handling
- FFmpeg transcoding ensures compatibility with DashScope ASR
- Supports multiple input formats (WebM, WAV, MP3, etc.)
- Automatic cleanup of temporary files

### 4. TTS Implementation
- Downloads audio from DashScope OSS storage URLs
- Handles both sync (base64) and async (URL) response formats
- Automatic object URL cleanup to prevent memory leaks

## Current Status & Known Issues

### ✅ Completed Features
- Full audio recording and upload workflow
- Real ASR integration with Aliyun DashScope
- Python-based pronunciation assessment with FunASR
- LLM-powered grammar and feedback generation
- TTS playback of corrected expressions
- Modern, responsive UI with real-time feedback

### ⚠️ Known Limitations
- TTS currently uses Chinese voice (`longxiaochun`) - may need English voice option
- First run requires model download (can take 1-2 minutes)
- FFmpeg path is hardcoded for Windows - needs cross-platform solution
- No reference text input UI (parameter exists but not exposed)

### 🔄 Potential Improvements
- Add reference text input field for targeted practice
- Support multiple TTS voices and languages
- Implement streaming ASR for real-time transcription
- Add pronunciation visualization (waveform, pitch contour)
- Export evaluation history and progress tracking

## Troubleshooting

### Network Error / API Key Issue
- Ensure `server/.env` is loaded correctly
- `dotenv.config()` must be called at the very top of `server/src/index.ts`
- Verify API key has access to DashScope services

### Python Sidecar Errors
- Check Python is in PATH: `python --version`
- Install dependencies: `pip install -r server/python/requirements.txt`
- First run downloads models automatically (check stderr output)
- Ensure sufficient disk space for model files (~500MB)

### FFmpeg Not Found
- Install FFmpeg and add to system PATH
- Or update hardcoded path in `ASRService.ts` line 33
- Verify installation: `ffmpeg -version`

### TypeScript Compilation Errors
- Avoid importing `dashscope` SDK (no type definitions)
- Use Axios for all DashScope API calls instead
- Run `npm install` to ensure all dependencies are installed

### Electron Build Errors
- Ensure `vite-plugin-electron` is configured correctly in `vite.config.ts`
- Clear `dist/` folder and rebuild if issues persist
