# EchoTutor

一个面向多语言口语练习的桌面原型项目。当前实现重点是“目标语言 + 跟读评测”链路：用户选择练习语言并输入参考文本后，可以逐句录音练习，系统返回识别文本、词级对比与评分、发音/语调评分、AI 反馈，并支持播放标准示例音频。

## 当前已实现功能

- 参考文本输入，自动按句切分
- 目标语言选择：英语、中文、韩语、日语、西语、法语、自动检测
- 逐句跟读练习，支持上一句/下一句切换
- 麦克风录音提交
- 本地音频文件上传
- 识别文本与参考句的词级/字符级对比展示
- 词级评分展示，并与文本对比融合
- 发音准确度、语调节奏、综合反馈三类结果展示
- 结合音频评分结果生成中文 AI 学习反馈
- 多语言表达修正：修正句会尽量保持在用户选择的目标语言中
- 语言漂移处理：例如英语模式下 ASR 输出韩文音译时，不再把韩文作为识别文本或词级对比展示
- 自然目标语言检测：例如韩语/日语/中文模式下，识别文本虽然使用目标文字，但更像外语音译时，会提示不是自然目标语言表达
- 场景对话练习
- 播放当前句或纠正句的 TTS 标准音频
- 对静音、超短音频、模型异常场景返回错误信息

## 当前技术方案

### 前端

- `React 19 + Vite`
- `react-media-recorder` 负责浏览器录音
- `axios` 调用本地后端接口

当前前端页面主要包含：

- 目标语言选择
- 跟读文本输入区
- 当前句展示与句间切换
- 录音控制
- 文件上传
- 场景对话
- 结果面板：文本对比、词级评分、总分、AI 反馈、TTS 回放

### 后端

- `Node.js + Express + TypeScript`
- `multer` 使用内存存储接收音频
- 提供两个核心接口：
  - `POST /api/process-audio`
  - `POST /api/tts-generate`
- 提供场景对话接口：
  - `GET /api/scenarios`
  - `POST /api/scenarios/start`
  - `POST /api/scenarios/reply`

### 音频评测链路

当前主流程是多路评测与融合：

1. 前端上传录音、目标语言和可选参考文本
2. Node 服务预处理音频，并分别调用 ASR、云端发音评测、本地节奏分析
3. Python 侧车脚本 `server/python/cloud_eval.py` 调用语音模型做识别和保守评分
4. Python 侧车脚本 `server/python/word_timing.py` 生成估算的词级/字符级评分
5. Node 服务融合 ASR、云端评测、本地节奏和文本对齐结果
6. Node 服务执行语言漂移检测和自然目标语言检测
7. Node 服务调用 DashScope LLM 生成面向学习者的反馈与目标语言表达修正
8. 前端展示识别文本、词级评分、总分、发音建议、表达修正和 TTS 回放

### 多语言处理

目标语言由前端通过 `language` 字段提交。当前支持：

- `en-US`: 英语
- `zh-CN`: 中文
- `ko-KR`: 韩语
- `ja-JP`: 日语
- `es-ES`: 西语
- `fr-FR`: 法语
- `auto`: 自动检测

语言相关逻辑集中在：

- `server/src/services/PracticeLanguage.ts`
- `server/src/services/TargetLanguageNaturalness.ts`
- `server/src/services/assessment/WordAlignmentService.ts`

文本对齐策略：

- 英语、西语、法语：按词对齐
- 韩语：按空格词块对齐
- 中文、日语：按字符对齐

语言漂移示例：

- 目标语言是英语，但 ASR 返回韩文/日文/中文脚本时，系统会判定为语言漂移
- 此时不会把错误脚本作为识别文本或词级对比展示
- 原始音译文本只会作为隐藏线索传给 LLM，用于尽量反推出表达修正中的目标语言句子

自然目标语言检测示例：

- 目标语言是韩语，ASR 返回韩文，但内容明显像英语音译，例如 `윗드 애너멜즈...`
- 系统会判定这不是自然韩语表达，并在语法/表达反馈中说明应使用韩语本身的词汇、语序和语法结构

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
│  ├─ python/cloud_eval.py # Python 云端识别与评分脚本
│  ├─ python/word_timing.py
│  └─ resources/dicts/     # 发音词典资源
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
- `language`: 可选，目标语言代码，默认 `en-US`

返回内容包含：

- `analysis.language`
- `analysis.transcription`
- `analysis.pronunciationScore`
- `analysis.prosodyScore`
- `analysis.confidenceScore`
- `analysis.pronunciationAnalysis`
- `analysis.wordAlignment`
- `analysis.wordTiming`
- `analysis.naturalness`
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
- 多语言发音评分质量取决于底层语音服务对目标语言的支持程度
- 词级时间与词级评分是估算结果，不等同于专业音素级强制对齐
- 自然目标语言检测是启发式规则，能覆盖常见音译/混语情况，但不是完整语言学判别器
- 目前更接近可运行 Demo，还没有用户体系、历史记录存储和正式打包流程

## 后续可继续完善的方向

- 将前端 API 地址改为可配置
- 增加 Electron 开发/打包脚本并统一启动流程
- 持久化练习记录与评分历史
- 增加更稳健的多语言分词和强制对齐算法
- 针对不同目标语言扩展更细的发音建议模板
- 将自然目标语言检测从启发式规则升级为模型辅助判别
- 为服务端和 Python 侧车增加自动化测试

## 备注

如果你现在看到的代码比 README 更“新”，以代码实现为准。这个 README 旨在准确描述仓库当前已经落地的能力，而不是最初的项目规划。
