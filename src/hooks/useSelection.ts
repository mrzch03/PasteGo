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

  // 从选中集合中移除指定 ID（用于删除条目后同步选中状态）
  const remove = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 全选指定列表中的所有条目
  const selectAll = useCallback((clips: ClipItem[]) => {
    setSelectedIds(new Set(clips.map((c) => c.id)));
  }, []);

  // 批量删除选中的条目对应的 ID
  const removeAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const getSelectedItems = useCallback(
    (clips: ClipItem[]) => clips.filter((c) => selectedIds.has(c.id)),
    [selectedIds]
  );

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggle,
    remove,
    removeAll,
    isSelected,
    clearSelection,
    selectAll,
    getSelectedItems,
  };
}
