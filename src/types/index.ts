export interface ClipItem {
  id: string;
  content: string;
  content_hash: string;
  clip_type: "text" | "code" | "url" | "image";
  source_app: string | null;
  image_path: string | null;
  is_pinned: boolean;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  prompt: string;
  category: string;
  shortcut: string | null;
}

export interface AiProvider {
  id: string;
  name: string;
  kind: "openai" | "claude" | "ollama" | "kimi" | "minimax";
  endpoint: string;
  model: string;
  api_key: string;
  is_default: boolean;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export type ClipTypeFilter = "all" | "text" | "code" | "url" | "image";

export type AppView = "history" | "generate" | "settings";
