# PasteGo

macOS 剪贴板 AI 助手 — 自动记录剪贴板历史，一键调用 AI 处理文本。

![macOS](https://img.shields.io/badge/macOS-14.0%2B-blue) ![Tauri](https://img.shields.io/badge/Tauri-v2-orange) ![License](https://img.shields.io/badge/License-MIT-green)

## 功能特性

- **剪贴板历史** — 自动监听并记录文本、代码、URL、图片，支持搜索和分类筛选
- **置顶收藏** — 重要内容一键置顶，不会被新记录冲掉
- **AI 模板** — 自定义提示词模板（翻译、总结、改写等），点击即刻生成
- **全局快捷键** — 为模板绑定快捷键，在任意 App 中按下即可调用 AI 处理当前剪贴板内容
- **自定义对话** — Chat 风格的自由输入模式，把剪贴板内容作为素材发送任意指令
- **多 AI 后端** — 支持 OpenAI、Claude、Ollama、Kimi、MiniMax 等，自由配置
- **流式输出** — 实时逐字显示生成结果，支持 Markdown 渲染和思维链折叠
- **隐私优先** — 数据全部存储在本地 SQLite，不上传任何内容

## 安装

### 下载安装

前往 [Releases](https://github.com/mrzch03/PasteGo/releases) 下载最新的 `.dmg` 文件，拖入 Applications 即可。

> 首次打开可能提示"无法验证开发者"，请前往 **系统设置 → 隐私与安全 → 仍要打开**。

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/mrzch03/PasteGo.git
cd PasteGo

# 安装前端依赖
npm install

# 开发模式
npx @tauri-apps/cli dev

# 构建发布版
npx @tauri-apps/cli build
```

**前置要求：** Node.js 18+、Rust 1.75+、Xcode Command Line Tools

## 使用指南

### 基本操作

| 操作 | 说明 |
|------|------|
| `Cmd+Shift+V` | 显示/隐藏主窗口 |
| 点击托盘图标 | 显示/隐藏主窗口 |
| `Esc` | 返回上一页 |

### 1. 剪贴板历史

启动后自动监听剪贴板，所有复制的内容都会出现在历史列表中。支持：
- 搜索关键词过滤
- 按类型筛选（文本 / 代码 / URL / 图片）
- 点击置顶按钮收藏重要内容

### 2. AI 生成

1. 在历史列表中勾选一条或多条素材
2. 点击「AI 生成」进入生成页面
3. 选择模板卡片（如「翻译」）即刻生成，或切换到「自定义」模式自由输入指令
4. 生成完成后点击「复制结果」

### 3. 全局快捷键

为模板绑定快捷键后，可在**任意应用**中使用：

1. 在其他 App 中复制一段文本
2. 按下模板快捷键（如默认的 `Cmd+Shift+T` 翻译）
3. PasteGo 自动弹出并生成结果

### 4. 配置 AI 服务

进入**设置**页面，添加 AI 服务商：

| 服务商 | Endpoint 示例 | 说明 |
|--------|---------------|------|
| OpenAI | `https://api.openai.com/v1` | 需要 API Key |
| Claude | `https://api.anthropic.com` | 需要 API Key |
| Ollama | `http://localhost:11434` | 本地部署，无需 Key |
| Kimi | `https://api.moonshot.cn/v1` | 需要 API Key |
| MiniMax | `https://api.minimax.chat/v1` | 需要 API Key |

### 5. 自定义模板

在设置页面创建模板：

- **名称**：显示在生成页的卡片上
- **提示词**：使用 `{{materials}}` 作为素材占位符
- **快捷键**：按下组合键录入，如 `Cmd+Shift+T`

示例提示词：
```
请将以下内容翻译为中文（如已是中文则翻译为英文）：

{{materials}}
```

## 技术栈

- **框架：** [Tauri v2](https://v2.tauri.app/) (Rust + WebView)
- **前端：** React 19 + TypeScript + Vite
- **数据库：** SQLite (rusqlite)
- **样式：** 原生 CSS，适配 macOS Light/Dark 主题

## License

[MIT](LICENSE)
