import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Template, AppView, ClipItem } from "./types";
import { ClipList } from "./components/ClipList";
import { GenerateView } from "./components/GenerateView";
import { SettingsView } from "./components/SettingsView";
import { useClipboard } from "./hooks/useClipboard";
import { useSelection } from "./hooks/useSelection";
import { useAI } from "./hooks/useAI";
import "./App.css";

function App() {
  const [view, setView] = useState<AppView>("history");
  const clipboard = useClipboard();
  const selection = useSelection();
  const ai = useAI();
  const [quickItems, setQuickItems] = useState<ClipItem[]>([]);
  const [quickTemplateId, setQuickTemplateId] = useState<string | null>(null);
  // 快照：进入生成视图时冻结已选素材，避免后续剪贴板变化导致素材丢失
  const [snapshotItems, setSnapshotItems] = useState<ClipItem[]>([]);

  // Keep a ref to templates so the listener always sees the latest
  const templatesRef = useRef<Template[]>([]);
  templatesRef.current = ai.templates;

  useEffect(() => {
    ai.fetchTemplates();
    ai.fetchProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for quick-template shortcut events — register once
  useEffect(() => {
    let cancelled = false;
    const unlisten = listen<string>("quick-template", async (event) => {
      if (cancelled) return;
      try {
        const templateId = event.payload;

        let text = "";
        try {
          text = await readText() || "";
        } catch {
          // clipboard read may fail
        }

        const tpl = templatesRef.current.find((t) => t.id === templateId) || null;

        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();

        const virtualItem = {
          id: "quick-template",
          content: text || "",
          content_hash: "",
          clip_type: "text" as const,
          source_app: null,
          image_path: null,
          is_pinned: false,
          created_at: new Date().toISOString(),
        };

        setQuickItems([virtualItem]);
        setQuickTemplateId(templateId);
        ai.setOutput("");
        ai.setError(null);
        setView("generate");

        if (!text?.trim()) {
          ai.setError("剪贴板为空，请先复制一些文本");
          return;
        }

        ai.generate([virtualItem], tpl, "");
      } catch (e) {
        console.error("Quick template failed:", e);
      }
    });
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartGenerate = useCallback(() => {
    if (selection.selectedCount === 0) return;
    // 冻结当前已选素材，防止后续剪贴板刷新导致素材丢失
    setSnapshotItems(selection.getSelectedItems(clipboard.clips));
    setQuickItems([]);
    setQuickTemplateId(null);
    ai.setOutput("");
    ai.setError(null);
    setView("generate");
  }, [selection, clipboard.clips, ai]);

  // Global keyboard: Escape to go back / hide
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view !== "history") {
          setView("history");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  return (
    <div className="app">
      {/* Title bar (draggable) */}
      <div className="titlebar" onMouseDown={() => getCurrentWindow().startDragging()}>
        <span className="brand-mark" /><span className="app-title">PasteGo</span>
        <div className="titlebar-actions">
          <button
            className={`nav-btn ${view === "history" ? "active" : ""}`}
            onClick={() => setView("history")}
            title="历史记录"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <rect x="3" y="1" width="10" height="14" rx="2" />
              <path d="M6 5h4M6 8h4M6 11h2" />
            </svg>
          </button>
          <button
            className={`nav-btn ${view === "settings" ? "active" : ""}`}
            onClick={() => setView("settings")}
            title="设置"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <circle cx="8" cy="8" r="2" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        {view === "history" && (
          <ClipList
            clips={clipboard.clips}
            search={clipboard.search}
            onSearchChange={clipboard.setSearch}
            typeFilter={clipboard.typeFilter}
            onTypeFilterChange={clipboard.setTypeFilter}
            isSelected={selection.isSelected}
            onToggleSelect={selection.toggle}
            onDelete={(id: string) => { clipboard.deleteClip(id); selection.remove(id); }}
            onTogglePin={clipboard.togglePin}
            selectedCount={selection.selectedCount}
            onStartGenerate={handleStartGenerate}
          />
        )}

        {view === "generate" && (
          <GenerateView
            selectedItems={quickItems.length > 0 ? quickItems : snapshotItems}
            templates={ai.templates}
            providers={ai.providers}
            output={ai.output}
            generating={ai.generating}
            error={ai.error}
            onGenerate={ai.generate}
            onBack={() => { setQuickItems([]); setQuickTemplateId(null); setSnapshotItems([]); setView("history"); }}
            onNavigateSettings={() => setView("settings")}
            initialTemplateId={quickTemplateId}
          />
        )}

        {view === "settings" && (
          <SettingsView
            providers={ai.providers}
            templates={ai.templates}
            onSaveProvider={ai.saveProvider}
            onDeleteProvider={ai.deleteProvider}
            onSaveTemplate={ai.saveTemplate}
            onDeleteTemplate={ai.deleteTemplate}
            onBack={() => setView("history")}
          />
        )}
      </div>
    </div>
  );
}

export default App;
