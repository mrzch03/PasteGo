import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Template, AiProvider, StreamChunk, ClipItem } from "../types";

export function useAI() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const items = await invoke<Template[]>("get_templates");
      setTemplates(items);
    } catch (e) {
      console.error("Failed to fetch templates:", e);
    }
  }, []);

  const fetchProviders = useCallback(async () => {
    try {
      const items = await invoke<AiProvider[]>("get_providers");
      setProviders(items);
    } catch (e) {
      console.error("Failed to fetch providers:", e);
    }
  }, []);

  const generate = useCallback(
    async (
      selectedItems: ClipItem[],
      template: Template | null,
      customPrompt: string,
      providerId?: string
    ) => {
      setGenerating(true);
      setOutput("");
      setError(null);

      // Assemble prompt
      const materials = selectedItems
        .map((item, i) => `【素材 ${i + 1}】(${item.clip_type})\n${item.content}`)
        .join("\n\n---\n\n");

      let prompt: string;
      if (template) {
        prompt = template.prompt.replace("{{materials}}", materials);
        if (customPrompt.trim()) {
          prompt += `\n\n额外要求：${customPrompt}`;
        }
      } else {
        prompt = customPrompt
          ? `${customPrompt}\n\n以下是参考素材：\n\n${materials}`
          : materials;
      }

      // Listen for stream events
      const unlisten = await listen<StreamChunk>("ai-stream", (event) => {
        if (event.payload.done) {
          setGenerating(false);
        } else {
          setOutput((prev) => prev + event.payload.content);
        }
      });
      unlistenRef.current = unlisten;

      try {
        await invoke("ai_generate", {
          providerId: providerId || null,
          prompt,
        });
      } catch (e) {
        setError(String(e));
        setGenerating(false);
      } finally {
        unlisten();
        unlistenRef.current = null;
      }
    },
    []
  );

  const saveProvider = useCallback(
    async (provider: AiProvider) => {
      await invoke("save_provider", { provider });
      await fetchProviders();
    },
    [fetchProviders]
  );

  const deleteProvider = useCallback(
    async (id: string) => {
      await invoke("delete_provider", { id });
      await fetchProviders();
    },
    [fetchProviders]
  );

  const saveTemplate = useCallback(
    async (template: Template) => {
      await invoke("save_template", { template });
      await fetchTemplates();
    },
    [fetchTemplates]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      await invoke("delete_template", { id });
      await fetchTemplates();
    },
    [fetchTemplates]
  );

  return {
    templates,
    providers,
    output,
    generating,
    error,
    fetchTemplates,
    fetchProviders,
    generate,
    saveProvider,
    deleteProvider,
    saveTemplate,
    deleteTemplate,
    setOutput,
    setError,
  };
}
