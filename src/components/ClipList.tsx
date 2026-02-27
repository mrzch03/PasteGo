import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { ClipItem, ClipTypeFilter } from "../types";

const TYPE_FILTERS: { key: ClipTypeFilter; label: string; icon: string }[] = [
  { key: "all", label: "全部", icon: "" },
  { key: "text", label: "文本", icon: "T" },
  { key: "code", label: "代码", icon: "</>" },
  { key: "url", label: "链接", icon: "@" },
  { key: "image", label: "图片", icon: "IMG" },
];

// 分隔符选项
const SEPARATOR_OPTIONS = [
  { key: "newline", label: "换行", value: "\n" },
  { key: "double-newline", label: "空行", value: "\n\n" },
  { key: "space", label: "空格", value: " " },
  { key: "comma", label: "逗号", value: ", " },
  { key: "dash", label: "分隔线", value: "\n---\n" },
];

interface Props {
  clips: ClipItem[];
  search: string;
  onSearchChange: (v: string) => void;
  typeFilter: ClipTypeFilter;
  onTypeFilterChange: (v: ClipTypeFilter) => void;
  isSelected: (id: string) => boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  selectedCount: number;
  onStartGenerate: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  getSelectedItems: (clips: ClipItem[]) => ClipItem[];
}

export function ClipList({
  clips,
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  isSelected,
  onToggleSelect,
  onDelete,
  onTogglePin,
  selectedCount,
  onStartGenerate,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  getSelectedItems,
}: Props) {
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [focusIndex, setFocusIndex] = useState(-1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // 图片预览弹窗状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // 合并复制分隔符
  const [separator, setSeparator] = useState("newline");
  const [showSeparatorPicker, setShowSeparatorPicker] = useState(false);
  const [mergeCopied, setMergeCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadImage = async (clip: ClipItem) => {
    if (clip.image_path && !imageCache[clip.id]) {
      try {
        const base64 = await invoke<string>("read_image_base64", {
          path: clip.image_path,
        });
        setImageCache((prev) => ({
          ...prev,
          [clip.id]: `data:image/png;base64,${base64}`,
        }));
      } catch (e) {
        console.error("Failed to load image:", e);
      }
    }
  };

  // 加载图片
  useEffect(() => {
    clips.forEach((clip) => {
      if (clip.clip_type === "image") loadImage(clip);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // 复制单条内容到剪贴板
  const handleCopy = useCallback(async (clip: ClipItem) => {
    try {
      await writeText(clip.content);
      setCopiedId(clip.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      console.error("复制失败:", e);
    }
  }, []);

  // 合并复制选中内容
  const handleMergeCopy = useCallback(async () => {
    const items = getSelectedItems(clips);
    if (items.length === 0) return;
    const sep = SEPARATOR_OPTIONS.find((s) => s.key === separator)?.value ?? "\n";
    const merged = items.map((item) => item.content).join(sep);
    try {
      await writeText(merged);
      setMergeCopied(true);
      setTimeout(() => setMergeCopied(false), 1500);
    } catch (e) {
      console.error("合并复制失败:", e);
    }
  }, [clips, getSelectedItems, separator]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+F: 聚焦搜索框
      if (e.metaKey && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      // 上下箭头导航列表
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, clips.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      }
      // 空格键切换选中
      if (e.key === " " && focusIndex >= 0 && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        onToggleSelect(clips[focusIndex].id);
      }
      // Cmd+Enter 开始生成
      if (e.metaKey && e.key === "Enter" && selectedCount > 0) {
        e.preventDefault();
        onStartGenerate();
      }
      // Esc 关闭图片预览
      if (e.key === "Escape" && previewImage) {
        e.preventDefault();
        setPreviewImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clips, focusIndex, selectedCount, onToggleSelect, onStartGenerate, previewImage]);

  // 滚动到聚焦项
  useEffect(() => {
    if (focusIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll(".clip-item");
      items[focusIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusIndex]);

  return (
    <div className="clip-list">
      {/* 搜索栏 */}
      <div className="search-bar">
        <div className="search-wrapper">
          <svg
            className="search-icon"
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
          >
            <path
              d="M10 10L13.5 13.5M6.5 11C3.46 11 1 8.54 1 5.5S3.46 0 6.5 0 12 2.46 12 5.5 9.54 11 6.5 11z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="搜索...  Cmd+F"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input"
          />
          {search && (
            <button className="search-clear" onClick={() => onSearchChange("")}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 3L9 9M9 3L3 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 类型过滤 */}
      <div className="type-filters">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-chip ${typeFilter === f.key ? "active" : ""}`}
            onClick={() => onTypeFilterChange(f.key)}
          >
            {f.icon && <span className="filter-icon">{f.icon}</span>}
            {f.label}
          </button>
        ))}
      </div>

      {/* 选择操作栏 */}
      {selectedCount > 0 && (
        <div className="selection-bar">
          <div className="selection-info">
            <span className="selection-count">{selectedCount}</span>
            <span>项已选</span>
          </div>
          <div className="selection-actions">
            <button className="btn-selection-action" onClick={onSelectAll} title="全选">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="1" y="1" width="12" height="12" rx="2" />
                <path d="M4 7L6 9L10 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              全选
            </button>
            <button className="btn-selection-action" onClick={onClearSelection} title="取消选择">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                <rect x="1" y="1" width="12" height="12" rx="2" />
                <path d="M4 4L10 10M10 4L4 10" strokeLinecap="round" />
              </svg>
              取消
            </button>
            <div className="separator-picker-wrapper">
              <button
                className={`btn-selection-action ${mergeCopied ? "copied" : ""}`}
                onClick={handleMergeCopy}
                title="合并复制选中内容"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <rect x="4" y="1" width="9" height="9" rx="1.5" />
                  <path d="M1 5v7a1.5 1.5 0 001.5 1.5H10" />
                </svg>
                {mergeCopied ? "已复制" : "合并复制"}
              </button>
              <button
                className="btn-separator-toggle"
                onClick={() => setShowSeparatorPicker(!showSeparatorPicker)}
                title="选择分隔符"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 4L5 7L8 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showSeparatorPicker && (
                <div className="separator-dropdown">
                  {SEPARATOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      className={`separator-option ${separator === opt.key ? "active" : ""}`}
                      onClick={() => { setSeparator(opt.key); setShowSeparatorPicker(false); }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn-selection-action btn-selection-delete"
              onClick={onDeleteSelected}
              title="删除选中"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M2 4h10M5 4V2h4v2M3 4v8h8V4" />
              </svg>
              删除
            </button>
            <button className="btn-generate" onClick={onStartGenerate}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1L15 8L8 15M15 8H1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              AI 生成
            </button>
          </div>
        </div>
      )}

      {/* 剪贴板条目列表 */}
      <div className="clip-items" ref={listRef}>
        {clips.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon-large">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.4"
              >
                <rect x="8" y="2" width="8" height="4" rx="1" />
                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                <path d="M9 14l2 2 4-4" />
              </svg>
            </div>
            <p className="empty-title">暂无剪贴板记录</p>
            <p className="empty-hint">复制文字或截图，内容会自动出现在这里</p>
          </div>
        )}
        {clips.map((clip, index) => (
          <div
            key={clip.id}
            className={`clip-item ${isSelected(clip.id) ? "selected" : ""} ${clip.is_pinned ? "pinned" : ""} ${focusIndex === index ? "focused" : ""}`}
            onClick={() => onToggleSelect(clip.id)}
          >
            <div className="clip-select-indicator">
              <div
                className={`select-circle ${isSelected(clip.id) ? "checked" : ""}`}
              >
                {isSelected(clip.id) && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 5L4 7L8 3"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>
            <div className="clip-body">
              <div className="clip-meta">
                <span className={`clip-type-badge ${clip.clip_type}`}>
                  {clip.clip_type === "text" && "文本"}
                  {clip.clip_type === "code" && "代码"}
                  {clip.clip_type === "url" && "链接"}
                  {clip.clip_type === "image" && "图片"}
                </span>
                {clip.source_app && (
                  <span className="clip-source">{clip.source_app}</span>
                )}
                <span className="clip-time">
                  {formatTime(clip.created_at)}
                </span>
                {clip.is_pinned && <span className="pin-indicator" />}
              </div>
              {clip.clip_type === "image" && imageCache[clip.id] ? (
                <img
                  src={imageCache[clip.id]}
                  alt="clipboard image"
                  className="clip-image-preview"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewImage(imageCache[clip.id]);
                  }}
                />
              ) : (
                <div
                  className={`clip-text ${clip.clip_type === "code" ? "code" : ""}`}
                >
                  {clip.content.length > 200
                    ? clip.content.slice(0, 200) + "..."
                    : clip.content}
                </div>
              )}
            </div>
            <div className="clip-actions">
              {/* 复制按钮 */}
              <button
                className={`btn-action btn-copy-item ${copiedId === clip.id ? "copied" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(clip);
                }}
                title="复制"
              >
                {copiedId === clip.id ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 7L6 10L11 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
                    <rect x="4" y="1" width="9" height="9" rx="1.5" />
                    <path d="M1 5v7a1.5 1.5 0 001.5 1.5H10" />
                  </svg>
                )}
              </button>
              {/* 置顶按钮 */}
              <button
                className="btn-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(clip.id);
                }}
                title={clip.is_pinned ? "取消置顶" : "置顶"}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill={clip.is_pinned ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.2"
                >
                  <path d="M5 1L9 1L9 5L12 7L12 8L8 8L8 13L6 13L6 8L2 8L2 7L5 5Z" />
                </svg>
              </button>
              {/* 删除按钮 — 更大更醒目 */}
              <button
                className="btn-action btn-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(clip.id);
                }}
                title="删除"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <path d="M2 4h10M5 4V2h4v2M3 4v8h8V4" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="image-preview-overlay"
          onClick={() => setPreviewImage(null)}
        >
          <div className="image-preview-container" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="预览" className="image-preview-full" />
            <button
              className="image-preview-close"
              onClick={() => setPreviewImage(null)}
              title="关闭预览"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4L12 12M12 4L4 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString("zh-CN");
}
