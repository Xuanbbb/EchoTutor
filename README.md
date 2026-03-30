# EchoTutor

一个面向英语口语练习的桌面原型项目。当前实现重点是“跟读评测”链路：用户输入参考文本后，可以逐句录音练习，系统返回识别文本、发音/语调评分、AI 反馈，并支持播放标准示例音频。

## 当前已实现功能

- 参考文本输入，自动按句切分
- 逐句跟读练习，支持上一句/下一句切换
- 麦克风录音提交
- 本地音频文件上传，便于调试
- 识别文本与参考句的逐词对比展示
- 发音准确度、语调节奏、综合反馈三类结果展示
- 结合音频评分结果生成中文 AI 学习反馈
- 播放当前句或纠正句的 TTS 标准音频
- 对静音、超短音频、模型异常场景返回错误信息

## 当前技术方案

### 前端

- `React 19 + Vite`
- `react-media-recorder` 负责浏览器录音
- `axios` 调用本地后端接口

当前前端页面主要包含：

- 跟读文本输入区
- 当前句展示与句间切换
- 录音控制
- 调试用音频上传
- 结果面板：文本对比、评分、AI 反馈、TTS 回放

### 后端

- `Node.js + Express + TypeScript`
- `multer` 使用内存存储接收音频
- 提供两个核心接口：
  - `POST /api/process-audio`
  - `POST /api/tts-generate`

### 音频评测链路

当前主流程不是传统 ASR -> 评分分离，而是：

1. 前端上传录音和可选参考文本
2. Node 服务将音频交给 Python 侧车脚本 `server/python/score.py`
3. Python 脚本先做音频预处理和静音检测
4. Python 脚本优先调用火山方舟“豆包·语音识别大模型”做语音识别，并基于识别结果与参考文本做保守的发音评分估算
5. Node 服务再调用 DashScope 对文本和评分结果做二次整理，生成面向学习者的反馈
6. 前端展示识别文本、分数、反馈和纠正表达

### TTS 链路

- 后端调用 DashScope `qwen3-tts-flash`
- 前端可以播放：
  - 当前练习句
  - AI 建议改写后的句子

## 目录结构

```text
EchoTutor/
├─ client/                 # React 前端
│  ├─ src/components/AudioRecorder.tsx
│  └─ electron/            # Electron 入口文件
├─ server/                 # Node + TS 后端
│  ├─ src/controllers/AudioController.ts
│  ├─ src/services/
│  └─ python/score.py      # Python 音频评分脚本
└─ README.md
```

## 运行环境

当前实现对本地环境有一些明确依赖：

- Node.js 18+
- Python 3.x，并且 `python` 命令可直接使用
- FFmpeg
- Speech provider API Key

说明：

- `server/python/score.py` 会优先使用 `C:\ffmpeg-7.1.1-full_build\bin\ffmpeg.exe`，不存在时回退到全局 `ffmpeg`
- 后端服务默认监听 `http://localhost:3000`
- 前端当前直接请求 `http://localhost:3000/api/...`

## 环境变量

在 `server/.env` 或 `server/python/.env` 中提供：

```env
VOLCENGINE_SPEECH_API_KEY=your_api_key
VOLCENGINE_SPEECH_RESOURCE_ID=volc.bigasr.auc_turbo
VOLCENGINE_SPEECH_BASE_URL=https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash

# Optional fallback
DASHSCOPE_API_KEY=your_api_key
PORT=3000
```

推荐使用火山官方 OpenSpeech 识别接口，资源 ID 可先用 `volc.bigasr.auc_turbo`，如控制台给了你专用资源 ID，再替换成控制台值。

`VOLCENGINE_SPEECH_API_KEY` / `DASHSCOPE_API_KEY` 同时被以下模块使用：

- Python 评分脚本
- Node 侧 LLM 反馈服务
- Node 侧 TTS 服务

## 安装依赖

### 1. 安装前端依赖

```bash
cd client
npm install
```

### 2. 安装后端依赖

```bash
cd server
npm install
```

### 3. 安装 Python 依赖

```bash
cd server/python
pip install -r requirements.txt
```

## 启动项目

建议分别启动后端和前端。

### 启动后端

```bash
cd server
npm run dev
```

### 启动前端

```bash
cd client
npm run dev
```

启动后访问 Vite 输出的本地地址即可。

## 接口说明

### `POST /api/health`

健康检查接口。

### `POST /api/process-audio`

表单字段：

- `audio`: 音频文件
- `referenceText`: 可选，当前跟读句子

返回内容包含：

- `analysis.transcription`
- `analysis.pronunciationScore`
- `analysis.prosodyScore`
- `analysis.confidenceScore`
- `analysis.pronunciationAnalysis`
- `feedback.overallScore`
- `feedback.grammarIssues`
- `feedback.pronunciationFeedback`
- `feedback.correction`

同时保留了兼容旧前端的数据字段：

- `transcription`
- `scoring`
- `evaluation`

### `POST /api/tts-generate`

请求体：

```json
{
  "text": "Please read this sentence."
}
```

返回 `audio/mpeg` 音频流。

## 已知限制

- 当前前端接口地址写死为 `http://localhost:3000`
- Python 音频评分依赖本机 Python 与 FFmpeg 环境
- 评测和 TTS 都依赖外部 DashScope 服务，离线不可用
- 项目中存在未完全接入的 `ASRService`，当前主链路并未使用该服务
- 目前更接近可运行 Demo，还没有用户体系、历史记录存储和正式打包流程

## 后续可继续完善的方向

- 将前端 API 地址改为可配置
- 增加 Electron 开发/打包脚本并统一启动流程
- 持久化练习记录与评分历史
- 增加更稳健的文本对齐算法，而不是当前的顺序逐词对比
- 为服务端和 Python 侧车增加自动化测试

## 备注

如果你现在看到的代码比 README 更“新”，以代码实现为准。这个 README 旨在准确描述仓库当前已经落地的能力，而不是最初的项目规划。
