# EchoTutor Project Context

## Project Overview

**EchoTutor** is an intelligent oral English practice system designed to help users improve their spoken English through AI-driven feedback. The project is structured as a mono-repo containing a desktop client and a backend server.

### Architecture

*   **Client**: A cross-platform desktop application built with **Electron**, **React**, and **TypeScript** (bundled via **Vite**). It handles user interaction, audio recording, and result visualization.
*   **Server**: A **Node.js** and **Express** application (TypeScript) that processes audio files, manages AI service integrations, and returns evaluation results.

### Key Technologies

*   **Frontend**: React 19, Vite, Electron, `react-media-recorder`.
*   **Backend**: Express.js, Multer (file handling), Axios.
*   **AI Integration**: 
    *   **LLM**: Aliyun DashScope (Tongyi Qianwen / Qwen) for scoring and grammar correction.
    *   **ASR**: Architecture ready (currently mocked in `ASRService`).
    *   **TTS**: Architecture ready (currently mocked in `TTSService`).

## Directory Structure

```
E:\EchoTutor\
├── client/                 # Frontend Electron application
│   ├── electron/           # Electron main process files
│   ├── src/                # React renderer process files
│   │   └── components/     # UI Components (e.g., AudioRecorder.tsx)
│   ├── vite.config.ts      # Vite configuration with Electron plugin
│   └── package.json
├── server/                 # Backend API service
│   ├── src/
│   │   ├── controllers/    # Request handlers (AudioController.ts)
│   │   ├── services/       # Business logic (LLM, ASR, TTS services)
│   │   └── index.ts        # Server entry point
│   ├── .env                # Environment variables (API Keys)
│   └── package.json
└── README.md               # Original project requirements document
```

## Setup and Development

### Prerequisites

*   Node.js (v18+ recommended)
*   npm
*   Git
*   Aliyun DashScope API Key

### Backend Setup (`server/`)

1.  Navigate to the server directory:
    ```bash
    cd server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment variables:
    *   Ensure `.env` exists in `server/`.
    *   Required variable: `DASHSCOPE_API_KEY=sk-xxxxxxxx...`
4.  Start the development server:
    ```bash
    npm run dev
    ```
    *   Runs on `http://localhost:3000`.
    *   Health check: `http://localhost:3000/api/health`.

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
    *   This will launch the Electron window.

## Development Conventions

*   **Language**: TypeScript is used for both client and server.
*   **Architecture Pattern**: 
    *   Backend follows a Controller-Service pattern.
    *   Frontend uses functional React components with Hooks.
*   **Audio Processing**:
    *   Client records audio as `blob`.
    *   Client uploads via `FormData` (`multipart/form-data`) to `/api/process-audio`.
    *   Server receives via `multer` (memory storage).
*   **AI Service Integration**:
    *   `LLMService.ts` handles communication with Aliyun DashScope.
    *   It expects a JSON response from the LLM containing `score`, `grammarIssues`, `pronunciationFeedback`, and `correction`.

## Current Status & Roadmap

*   **Completed**:
    *   Basic Electron + React scaffolding.
    *   Express server with file upload handling.
    *   Audio recording and upload UI (including file upload for debug).
    *   LLM Integration (Aliyun DashScope) for text evaluation.
*   **Pending/Mocked**:
    *   **ASR (Speech-to-Text)**: Currently mocked in `ASRService.ts`. Needs integration with real provider (e.g., Xunfei, Aliyun).
    *   **TTS (Text-to-Speech)**: Currently mocked in `TTSService.ts`.
    *   **Real-time feedback**: Currently uses request/response model.

## Troubleshooting

*   **Network Error / API Key Issue**:
    *   Ensure `server/.env` is loaded correctly.
    *   `dotenv.config()` must be called at the very top of `server/src/index.ts`.
*   **Electron Build Errors**:
    *   Ensure `vite-plugin-electron` is configured correctly in `vite.config.ts`.
    *   `renderer: {}` option was removed temporarily to fix a build issue.
