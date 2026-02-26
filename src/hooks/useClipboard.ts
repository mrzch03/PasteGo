import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ClipItem, ClipTypeFilter } from "../types";

export function useClipboard() {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ClipTypeFilter>("all");
  const [loading, setLoading] = useState(false);

  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      const items = await invoke<ClipItem[]>("get_clips", {
        search: search || null,
        clipType: typeFilter === "all" ? null : typeFilter,
        limit: 200,
        offset: 0,
      });
      setClips(items);
    } catch (e) {
      console.error("Failed to fetch clips:", e);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  useEffect(() => {
    const unlisten = listen<ClipItem>("clipboard-changed", () => {
      fetchClips();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [fetchClips]);

  const deleteClip = async (id: string) => {
    await invoke("delete_clip", { id });
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  const togglePin = async (id: string) => {
    const pinned = await invoke<boolean>("toggle_pin", { id });
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_pinned: pinned } : c))
    );
    fetchClips();
  };

  return {
    clips,
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    loading,
    deleteClip,
    togglePin,
    refresh: fetchClips,
  };
}
