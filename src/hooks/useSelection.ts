import { useState, useCallback } from "react";
import type { ClipItem } from "../types";

export function useSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const getSelectedItems = useCallback(
    (clips: ClipItem[]) => clips.filter((c) => selectedIds.has(c.id)),
    [selectedIds]
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggle,
    isSelected,
    clearSelection,
    getSelectedItems,
  };
}
