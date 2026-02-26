import { useState, useCallback } from "react";
import type { AiProvider, Template } from "../types";

/** Convert a KeyboardEvent into a Tauri-compatible shortcut string */
function keyEventToShortcut(e: React.KeyboardEvent): string | null {
  // Ignore pure modifier presses
  const ignoredKeys = new Set(["Control", "Shift", "Alt", "Meta", "CapsLock", "Tab", "Escape"]);
  if (ignoredKeys.has(e.key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  // Need at least one modifier
  if (parts.length === 0) return null;

  // Normalize key name
  let key = e.key;
  if (key.length === 1) {
    key = key.toUpperCase();
  } else {
    // Map common key names to Tauri format
    const keyMap: Record<string, string> = {
      ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
      " ": "Space", Enter: "Return", Backspace: "Backspace", Delete: "Delete",
    };
    key = keyMap[key] || key;
  }

  parts.push(key);
  return parts.join("+");
}

type ProviderKind = AiProvider["kind"];

interface Props {
  providers: AiProvider[];
  templates: Template[];
  onSaveProvider: (provider: AiProvider) => Promise<void>;
  onDeleteProvider: (id: string) => Promise<void>;
  onSaveTemplate: (template: Template) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onBack: () => void;
}

const PROVIDER_PRESETS: Record<
  string,
  { label: string; endpoint: string; models: string[]; needsKey: boolean }
> = {
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    needsKey: true,
  },
  claude: {
    label: "Claude (Anthropic)",
    endpoint: "https://api.anthropic.com/v1",
    models: [
      "claude-sonnet-4-20250514",
      "claude-haiku-4-20250414",
      "claude-opus-4-20250514",
    ],
    needsKey: true,
  },
  kimi: {
    label: "Kimi (月之暗面)",
    endpoint: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
    needsKey: true,
  },
  minimax: {
    label: "MiniMax (海螺)",
    endpoint: "https://api.minimax.chat/v1",
    models: ["MiniMax-Text-01", "abab6.5s-chat", "abab5.5-chat"],
    needsKey: true,
  },
  ollama: {
    label: "Ollama (本地)",
    endpoint: "http://localhost:11434",
    models: ["llama3", "mistral", "codellama", "qwen2"],
    needsKey: false,
  },
};

const KIND_COLORS: Record<string, string> = {
  openai: "#10a37f",
  claude: "#d97706",
  kimi: "#6366f1",
  minimax: "#ec4899",
  ollama: "#8b5cf6",
};

export function SettingsView({
  providers,
  templates,
  onSaveProvider,
  onDeleteProvider,
  onSaveTemplate,
  onDeleteTemplate,
  onBack,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [tplForm, setTplForm] = useState<Template>({
    id: "",
    name: "",
    prompt: "",
    category: "general",
    shortcut: null,
  });

  const handleShortcutKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const shortcut = keyEventToShortcut(e);
    if (shortcut) {
      setTplForm((prev) => ({ ...prev, shortcut }));
      setRecordingShortcut(false);
    }
  }, []);
  const [form, setForm] = useState<AiProvider>({
    id: "",
    name: "",
    kind: "openai",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o",
    api_key: "",
    is_default: false,
  });

  const startAdd = () => {
    setForm({
      id: `provider-${Date.now()}`,
      name: "",
      kind: "openai",
      endpoint: PROVIDER_PRESETS.openai.endpoint,
      model: PROVIDER_PRESETS.openai.models[0],
      api_key: "",
      is_default: providers.length === 0,
    });
    setEditing(true);
  };

  const startEdit = (p: AiProvider) => {
    setForm({ ...p });
    setEditing(true);
  };

  const handleKindChange = (kind: ProviderKind) => {
    const preset = PROVIDER_PRESETS[kind];
    setForm((prev) => ({
      ...prev,
      kind,
      endpoint: preset.endpoint,
      model: preset.models[0],
      name: prev.name || preset.label,
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert("请输入名称");
      return;
    }
    await onSaveProvider(form);
    setEditing(false);
  };

  const startAddTemplate = () => {
    setTplForm({
      id: `tpl-${Date.now()}`,
      name: "",
      prompt: "",
      category: "general",
      shortcut: null,
    });
    setEditingTemplate(true);
  };

  const startEditTemplate = (t: Template) => {
    setTplForm({ ...t });
    setEditingTemplate(true);
  };

  const handleSaveTemplate = async () => {
    if (!tplForm.name.trim()) {
      alert("请输入模板名称");
      return;
    }
    if (!tplForm.prompt.trim()) {
      alert("请输入提示词");
      return;
    }
    await onSaveTemplate({
      ...tplForm,
      shortcut: tplForm.shortcut?.trim() || null,
    });
    setEditingTemplate(false);
  };

  return (
    <div className="settings-view">
      <div className="settings-header">
        <button className="btn-back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          返回
        </button>
        <h3>设置</h3>
      </div>

      <div className="settings-section">
        <div className="section-header">
          <h4>AI 模型</h4>
          {!editing && (
            <button className="btn-add" onClick={startAdd}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 1V13M1 7H13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              添加
            </button>
          )}
        </div>

        {editing ? (
          <div className="provider-form">
            {/* Quick select cards */}
            <div className="kind-cards">
              {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  className={`kind-card ${form.kind === key ? "active" : ""}`}
                  onClick={() => handleKindChange(key as ProviderKind)}
                  style={
                    {
                      "--kind-color": KIND_COLORS[key],
                    } as React.CSSProperties
                  }
                >
                  <span className="kind-dot" />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>

            <div className="form-group">
              <label>名称</label>
              <input
                type="text"
                placeholder={`例如: ${PROVIDER_PRESETS[form.kind]?.label}`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>API 地址</label>
              <input
                type="text"
                value={form.endpoint}
                onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>模型</label>
              <input
                type="text"
                placeholder={`例如: ${PROVIDER_PRESETS[form.kind]?.models[0] || "model-name"}`}
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            {PROVIDER_PRESETS[form.kind]?.needsKey && (
              <div className="form-group">
                <label>API Key</label>
                <input
                  type="password"
                  placeholder="输入 API Key..."
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                />
              </div>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) =>
                  setForm({ ...form, is_default: e.target.checked })
                }
              />
              <span>设为默认模型</span>
            </label>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setEditing(false)}>
                取消
              </button>
              <button className="btn-save" onClick={handleSave}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="provider-list">
            {providers.length === 0 && (
              <div className="empty-providers">
                <div className="empty-icon">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <p>尚未配置 AI 模型</p>
                <p className="hint">点击上方"添加"按钮开始配置</p>
              </div>
            )}
            {providers.map((p) => (
              <div key={p.id} className="provider-item">
                <div className="provider-info">
                  <div className="provider-name-row">
                    <span
                      className="provider-dot"
                      style={{ background: KIND_COLORS[p.kind] || "#999" }}
                    />
                    <span className="provider-name">{p.name}</span>
                    {p.is_default && (
                      <span className="default-badge">默认</span>
                    )}
                  </div>
                  <span className="provider-detail">
                    {PROVIDER_PRESETS[p.kind]?.label || p.kind} · {p.model}
                  </span>
                </div>
                <div className="provider-actions">
                  <button
                    className="btn-icon-sm"
                    onClick={() => startEdit(p)}
                    title="编辑"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    >
                      <path d="M8.5 2.5l3 3M1 10l7-7 3 3-7 7H1v-3z" />
                    </svg>
                  </button>
                  <button
                    className="btn-icon-sm btn-delete"
                    onClick={() => onDeleteProvider(p.id)}
                    title="删除"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    >
                      <path d="M2 4h10M5 4V2h4v2M3 4v8h8V4" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template management */}
      <div className="settings-section">
        <div className="section-header">
          <h4>模板</h4>
          {!editingTemplate && (
            <button className="btn-add" onClick={startAddTemplate}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 1V13M1 7H13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              添加
            </button>
          )}
        </div>

        {editingTemplate ? (
          <div className="provider-form">
            <div className="form-group">
              <label>名称</label>
              <input
                type="text"
                placeholder="例如: 翻译、总结..."
                value={tplForm.name}
                onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>提示词</label>
              <textarea
                placeholder="使用 {{materials}} 作为素材占位符..."
                value={tplForm.prompt}
                onChange={(e) => setTplForm({ ...tplForm, prompt: e.target.value })}
                rows={4}
              />
            </div>
            <div className="form-group">
              <label>全局快捷键（可选）</label>
              <div className="shortcut-recorder">
                <div
                  className={`shortcut-recorder-box ${recordingShortcut ? "recording" : ""}`}
                  tabIndex={0}
                  onKeyDown={handleShortcutKeyDown}
                  onFocus={() => setRecordingShortcut(true)}
                  onBlur={() => setRecordingShortcut(false)}
                >
                  {recordingShortcut
                    ? "请按下快捷键组合..."
                    : tplForm.shortcut || "点击此处录制快捷键"}
                </div>
                {tplForm.shortcut && (
                  <button
                    className="shortcut-clear-btn"
                    onClick={() => setTplForm({ ...tplForm, shortcut: null })}
                    title="清除快捷键"
                  >
                    ✕
                  </button>
                )}
              </div>
              <span className="hint">点击后按下组合键即可录入，需包含 Cmd/Ctrl 等修饰键</span>
            </div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setEditingTemplate(false)}>
                取消
              </button>
              <button className="btn-save" onClick={handleSaveTemplate}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="provider-list">
            {templates.length === 0 && (
              <div className="empty-providers">
                <p>尚未添加模板</p>
                <p className="hint">点击上方"添加"按钮创建模板</p>
              </div>
            )}
            {templates.map((t) => (
              <div key={t.id} className="provider-item">
                <div className="provider-info">
                  <div className="provider-name-row">
                    <span className="provider-name">{t.name}</span>
                    {t.shortcut && (
                      <span className="default-badge" style={{ background: "#007aff" }}>
                        {t.shortcut}
                      </span>
                    )}
                  </div>
                  <span className="provider-detail">
                    {t.prompt.slice(0, 50)}{t.prompt.length > 50 ? "..." : ""}
                  </span>
                </div>
                <div className="provider-actions">
                  <button
                    className="btn-icon-sm"
                    onClick={() => startEditTemplate(t)}
                    title="编辑"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    >
                      <path d="M8.5 2.5l3 3M1 10l7-7 3 3-7 7H1v-3z" />
                    </svg>
                  </button>
                  <button
                    className="btn-icon-sm btn-delete"
                    onClick={() => onDeleteTemplate(t.id)}
                    title="删除"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    >
                      <path d="M2 4h10M5 4V2h4v2M3 4v8h8V4" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard shortcuts info */}
      <div className="settings-section">
        <div className="section-header">
          <h4>快捷键</h4>
        </div>
        <div className="shortcuts-list">
          <div className="shortcut-row">
            <span>快速打开/隐藏历史列表</span>
            <kbd>Cmd + Shift + V</kbd>
          </div>
          {templates.filter(t => t.shortcut).map(t => (
            <div className="shortcut-row" key={t.id}>
              <span>{t.name}</span>
              <kbd>{t.shortcut}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
