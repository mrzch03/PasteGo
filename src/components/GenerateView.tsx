import { useState, useEffect, useRef, useMemo } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import Markdown from "react-markdown";
import type { ClipItem, Template, AiProvider } from "../types";

const TEMPLATE_EMOJIS: Record<string, string> = {
  "tpl-translate": "🌐",
};

const TEMPLATE_COLORS = [
  "#007aff", "#34c759", "#ff9500", "#5856d6", "#af52de", "#ff2d55", "#ff6b35", "#30b0c7",
];

/** Split output into think blocks and main content */
function parseOutput(raw: string): { thinking: string; content: string } {
  const thinkMatch = raw.match(/<think>([\s\S]*?)(<\/think>|$)/);
  if (!thinkMatch) return { thinking: "", content: raw };

  const thinking = thinkMatch[1].trim();
  const afterThink = raw.replace(/<think>[\s\S]*?(<\/think>|$)/, "").trim();
  return { thinking, content: afterThink };
}

interface Props {
  selectedItems: ClipItem[];
  templates: Template[];
  providers: AiProvider[];
  output: string;
  generating: boolean;
  error: string | null;
  onGenerate: (
    items: ClipItem[],
    template: Template | null,
    customPrompt: string,
    providerId?: string
  ) => void;
  onBack: () => void;
  onNavigateSettings: () => void;
  initialTemplateId?: string | null;
}

export function GenerateView({
  selectedItems,
  templates,
  providers,
  output,
  generating,
  error,
  onGenerate,
  onBack,
  onNavigateSettings,
  initialTemplateId,
}: Props) {
  const [isCustomMode, setIsCustomMode] = useState(!initialTemplateId);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(initialTemplateId || null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [thinkExpanded, setThinkExpanded] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const defaultProvider = providers.find((p) => p.is_default) || providers[0];

  const parsed = useMemo(() => parseOutput(output), [output]);

  // Click a template card → immediately generate
  const handleTemplateClick = (template: Template) => {
    if (generating) return;
    setIsCustomMode(false);
    setActiveTemplateId(template.id);
    onGenerate(selectedItems, template, "");
  };

  // Custom mode: send from input
  const handleCustomSend = () => {
    if (!customPrompt.trim() || generating) return;
    onGenerate(selectedItems, null, customPrompt);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCustomSend();
    }
  };

  const handleCopy = async () => {
    try {
      await writeText(parsed.content || output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  return (
    <div className="generate-view generate-view-chat">
      <div className="generate-header">
        <button className="btn-back" onClick={onBack}>
          ← 返回
        </button>
        <h3>AI 生成</h3>
      </div>

      {/* Selected materials */}
      <div className="materials-bar">
        <span className="materials-label">已选素材 ({selectedItems.length})</span>
        <div className="materials-chips">
          {selectedItems.map((item) => (
            <span key={item.id} className="material-chip">
              {item.clip_type === "image" ? "🖼️ 图片" : item.content.slice(0, 30)}
              {item.content.length > 30 ? "..." : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Template card selector */}
      <div className="template-cards">
        <div
          className={`template-card ${isCustomMode ? "active" : ""}`}
          style={{ "--tpl-color": "#5856d6" } as React.CSSProperties}
          onClick={() => {
            setIsCustomMode(true);
            setActiveTemplateId(null);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
        >
          <span className="template-card-emoji">💬</span>
          <span className="template-card-label">自定义</span>
        </div>
        {templates.map((t, i) => {
          const emoji = TEMPLATE_EMOJIS[t.id] || "📄";
          const color = TEMPLATE_COLORS[i % TEMPLATE_COLORS.length];
          return (
            <div
              key={t.id}
              className={`template-card ${activeTemplateId === t.id ? "active" : ""}`}
              style={{ "--tpl-color": color } as React.CSSProperties}
              onClick={() => handleTemplateClick(t)}
            >
              <span className="template-card-emoji">{emoji}</span>
              <span className="template-card-label">{t.name}</span>
            </div>
          );
        })}
        {/* Settings shortcut card */}
        <div
          className="template-card"
          style={{ "--tpl-color": "#8e8e93" } as React.CSSProperties}
          onClick={onNavigateSettings}
        >
          <span className="template-card-emoji">⚙</span>
          <span className="template-card-label">管理</span>
        </div>
      </div>

      {/* Provider hint */}
      {defaultProvider && (
        <div className="provider-hint">
          将使用 {defaultProvider.name} 生成
        </div>
      )}

      {/* Error */}
      {error && <div className="error-message">{error}</div>}

      {/* Output */}
      {(output || generating) && (
        <div className="output-section">
          <div className="output-header">
            <span>生成结果</span>
            {output && !generating && (
              <button className="btn-copy" onClick={handleCopy}>
                {copied ? "已复制 ✓" : "复制结果"}
              </button>
            )}
          </div>
          <div className="output-content" ref={outputRef}>
            {/* Think block (collapsible) */}
            {parsed.thinking && (
              <div className="think-block">
                <button
                  className="think-toggle"
                  onClick={() => setThinkExpanded(!thinkExpanded)}
                >
                  <span className="think-toggle-icon">{thinkExpanded ? "▾" : "▸"}</span>
                  思考过程
                  {!thinkExpanded && (
                    <span className="think-preview">
                      {parsed.thinking.slice(0, 40)}...
                    </span>
                  )}
                </button>
                {thinkExpanded && (
                  <div className="think-content">{parsed.thinking}</div>
                )}
              </div>
            )}
            {/* Main content with markdown */}
            {parsed.content ? (
              <div className="markdown-body">
                <Markdown>{parsed.content}</Markdown>
              </div>
            ) : (
              generating && !parsed.thinking && "等待响应..."
            )}
            {generating && <span className="cursor-blink">▊</span>}
          </div>
        </div>
      )}

      {/* Chat-style input bar (only in custom mode) */}
      {isCustomMode && (
        <div className="chat-input-bar">
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder="输入你的指令..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={generating || providers.length === 0}
          />
          <button
            className="chat-send-btn"
            onClick={handleCustomSend}
            disabled={generating || !customPrompt.trim() || providers.length === 0}
          >
            {generating ? "..." : "➤"}
          </button>
        </div>
      )}
    </div>
  );
}
