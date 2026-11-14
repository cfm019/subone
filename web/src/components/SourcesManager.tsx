import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Edit2,
  Eraser,
  ExternalLink,
  FileText,
  GripVertical,
  Layers,
  Plus,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { SubscriptionSource, ProxyNode, ConfigTemplate } from '../types';
import { nodeToUri } from '../utils/nodeUri';
import { copyToClipboard } from '../utils/clipboard';

interface SourcesManagerProps {
  sources: SubscriptionSource[];
  nodes?: ProxyNode[];
  templates?: ConfigTemplate[];
  onAddSource: (source: { name: string; url?: string; type: string; filterConfig?: any }) => Promise<void>;
  onAddCustomGroup?: (name: string) => Promise<void>;
  onUpdateSource: (id: string, updates: Partial<SubscriptionSource>) => Promise<void>;
  onDeleteSource: (id: string) => Promise<void>;
  onRefreshSource: (id: string) => Promise<void>;
  onRefreshAllSources?: () => Promise<void>;
  onImportCustomNodes: (text: string, replaceAll?: boolean, targetSourceId?: string) => Promise<void>;
  onUpdateCustomNode?: (id: string, updates: Partial<ProxyNode>) => Promise<void>;
  onDeleteCustomNode: (id: string) => Promise<void>;
  onReorderNodes?: (sourceId: string, newNodes: ProxyNode[]) => Promise<void>;
}

export const SourcesManager: React.FC<SourcesManagerProps> = ({
  sources,
  nodes,
  templates = [],
  onAddSource,
  onAddCustomGroup,
  onUpdateSource,
  onDeleteSource,
  onRefreshSource,
  onRefreshAllSources,
  onImportCustomNodes,
  onUpdateCustomNode,
  onDeleteCustomNode,
  onReorderNodes,
}) => {
  // Modal states
  const [showAddNetworkModal, setShowAddNetworkModal] = useState(false);
  const [editingNetworkSource, setEditingNetworkSource] = useState<SubscriptionSource | null>(null);
  const [showImportNodesModal, setShowImportNodesModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [renamingSource, setRenamingSource] = useState<SubscriptionSource | null>(null);
  const [newGroupNameInput, setNewGroupNameInput] = useState('');

  // Extract custom template outbounds and existing node detours for detour selection
  const availableDetourOutbounds = useMemo(() => {
    const customTags: string[] = [];
    (templates || []).forEach(tpl => {
      if (tpl.content) {
        try {
          const parsed = JSON.parse(tpl.content);
          if (Array.isArray(parsed.outbounds)) {
            parsed.outbounds.forEach((o: any) => {
              const tag = (o?.tag || '').trim();
              if (tag && tag !== 'REJECT' && tag !== 'GLOBAL' && !customTags.includes(tag)) {
                customTags.push(tag);
              }
            });
          }
        } catch {}
      }
    });
    (nodes || []).forEach(n => {
      const tag = (n.detour || '').trim();
      if (tag && !customTags.includes(tag)) {
        customTags.push(tag);
      }
    });
    return customTags;
  }, [templates, nodes]);

  // Node edit state (name & config text & detour)
  const [editingNode, setEditingNode] = useState<{ id: string; name: string; rawText: string; detour?: string } | null>(null);
  const [editNodeNameInput, setEditNodeNameInput] = useState('');
  const [editNodeTextInput, setEditNodeTextInput] = useState('');
  const [editNodeDetourInput, setEditNodeDetourInput] = useState('');

  // Target group for importing nodes
  const [targetGroupId, setTargetGroupId] = useState<string>('custom');
  const [customText, setCustomText] = useState('');
  const [customReplaceAll, setCustomReplaceAll] = useState(false);

  // Bulk edit all subscription text for a custom group
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditingSource, setBulkEditingSource] = useState<SubscriptionSource | null>(null);
  const [bulkEditText, setBulkEditText] = useState('');
  const [bulkEditCopied, setBulkEditCopied] = useState(false);

  // Network source form states
  const [newNetworkName, setNewNetworkName] = useState('');
  const [newNetworkUrl, setNewNetworkUrl] = useState('');
  const [newNetworkType, setNewNetworkType] = useState<NonNullable<SubscriptionSource['type']>>('auto');

  // Loading & Action states
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  // Accordion expanded source IDs (默认全部收起)
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(new Set());

  // Reorder & Drag-and-drop states
  const [reorderAnnouncement, setReorderAnnouncement] = useState('');
  const announceTimerRef = useRef<number | null>(null);
  const listRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Keyboard grab-move-drop state
  const [kbGrabbedNode, setKbGrabbedNode] = useState<{
    sourceId: string;
    nodeId: string;
    initialNodes: ProxyNode[];
  } | null>(null);

  // Pointer drag state ref
  interface PointerDragState {
    pointerId: number;
    sourceId: string;
    nodeId: string;
    sourceIdx: number;
    targetIdx: number;
    startY: number;
    startScrollY: number;
    lastClientY: number;
    itemEl: HTMLElement;
    listEl: HTMLElement;
    handleEl: HTMLElement;
    rafId: number | null;
  }
  const pointerDragRef = useRef<PointerDragState | null>(null);

  const announceReorder = (message: string, delayMs = 80) => {
    if (announceTimerRef.current) {
      window.clearTimeout(announceTimerRef.current);
    }
    setReorderAnnouncement('');
    announceTimerRef.current = window.setTimeout(() => {
      setReorderAnnouncement(message);
    }, delayMs);
  };

  useEffect(() => {
    return () => {
      if (announceTimerRef.current) {
        window.clearTimeout(announceTimerRef.current);
      }
      document.documentElement.classList.remove('is-dragging-node');
    };
  }, []);

  const commitNodeOrder = async (source: SubscriptionSource, nextNodes: ProxyNode[]) => {
    if (onReorderNodes) {
      await onReorderNodes(source.id, nextNodes);
    } else {
      await onUpdateSource(source.id, { nodes: nextNodes });
    }
  };

  const runReorderWithFlip = (
    sourceId: string,
    performUpdate: () => void,
    movedNodeId?: string,
    releasedTranslateY?: number
  ) => {
    const listEl = listRefs.current[sourceId];
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!listEl || prefersReducedMotion) {
      performUpdate();
      return;
    }

    const oldRects = new Map<string, DOMRect>();
    const children = Array.from(listEl.querySelectorAll<HTMLElement>('[data-node-id]'));
    children.forEach(el => {
      const id = el.dataset.nodeId;
      if (id) {
        el.getAnimations().forEach(anim => anim.finish());
        oldRects.set(id, el.getBoundingClientRect());
      }
    });

    performUpdate();

    requestAnimationFrame(() => {
      const currentListEl = listRefs.current[sourceId];
      if (!currentListEl) return;
      const newChildren = Array.from(currentListEl.querySelectorAll<HTMLElement>('[data-node-id]'));
      newChildren.forEach(el => {
        const id = el.dataset.nodeId;
        if (!id) return;
        const oldRect = oldRects.get(id);
        if (!oldRect) return;
        const newRect = el.getBoundingClientRect();
        let dy = oldRect.top - newRect.top;
        if (id === movedNodeId && releasedTranslateY !== undefined) {
          dy += releasedTranslateY;
        }
        if (Math.abs(dy) > 1) {
          el.animate(
            [{ translate: `0px ${dy}px` }, { translate: '0px 0px' }],
            { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          );
        }
      });
    });
  };

  // Move single node up / down / top
  const handleMoveNode = async (
    source: SubscriptionSource,
    fromIdx: number,
    toIdx: number,
    focusTargetSelector?: string
  ) => {
    const currentNodes = source.nodes || [];
    if (
      fromIdx < 0 ||
      fromIdx >= currentNodes.length ||
      toIdx < 0 ||
      toIdx >= currentNodes.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const nextNodes = [...currentNodes];
    const [moved] = nextNodes.splice(fromIdx, 1);
    nextNodes.splice(toIdx, 0, moved);

    runReorderWithFlip(
      source.id,
      () => {
        commitNodeOrder(source, nextNodes);
      },
      moved.id
    );

    requestAnimationFrame(() => {
      const listEl = listRefs.current[source.id];
      const itemEl = listEl?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(moved.id)}"]`);
      if (itemEl) {
        itemEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (focusTargetSelector) {
          const targetBtn = itemEl.querySelector<HTMLElement>(focusTargetSelector);
          if (targetBtn && !(targetBtn as HTMLButtonElement).disabled) {
            targetBtn.focus({ preventScroll: true });
          } else {
            const altBtn = itemEl.querySelector<HTMLElement>('[data-move-btn]:not(:disabled)');
            altBtn?.focus({ preventScroll: true });
          }
        }
      }
    });

    announceReorder(`已将节点 ${moved.name} 移至第 ${toIdx + 1} 位（共 ${nextNodes.length} 个）`, 500);
  };

  // Bulk sort nodes with View Transition (per dynamic-sort guide)
  const handleQuickSortNodes = (
    source: SubscriptionSource,
    mode: 'name-asc' | 'reverse'
  ) => {
    const currentNodes = source.nodes || [];
    if (currentNodes.length <= 1) return;

    const nextNodes = [...currentNodes];
    let label = '';
    if (mode === 'name-asc') {
      nextNodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
      label = '按名称升序排列';
    } else if (mode === 'reverse') {
      nextNodes.reverse();
      label = '已反转节点顺序';
    }

    const listEl = listRefs.current[source.id];
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const applyUpdate = () => {
      commitNodeOrder(source, nextNodes);
    };

    if (!prefersReducedMotion && currentNodes.length <= 200) {
      const anyListEl = listEl as any;
      if (anyListEl && typeof anyListEl.startViewTransition === 'function') {
        anyListEl.startViewTransition(applyUpdate);
      } else if (typeof (document as any).startViewTransition === 'function') {
        (document as any).startViewTransition(applyUpdate);
      } else {
        applyUpdate();
      }
    } else {
      applyUpdate();
    }

    announceReorder(`${source.name}：${label}，共 ${nextNodes.length} 个节点`);
  };

  // Update drop marker CSS variables on list container from layout midpoints
  const updateDropMarker = (drag: PointerDragState, clientY: number) => {
    const { listEl, sourceIdx } = drag;
    const items = Array.from(listEl.querySelectorAll<HTMLElement>('[data-node-id]'));
    if (items.length === 0) return;

    const listRect = listEl.getBoundingClientRect();
    const clampedY = Math.max(listRect.top, Math.min(listRect.bottom, clientY));
    const pointerOffsetInList = clampedY - listRect.top - listEl.clientTop + listEl.scrollTop;

    let insertBeforeIdx = items.length;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      const midpoint = el.offsetTop + el.offsetHeight / 2;
      if (pointerOffsetInList < midpoint) {
        insertBeforeIdx = i;
        break;
      }
    }

    const finalIdx = insertBeforeIdx > sourceIdx ? insertBeforeIdx - 1 : insertBeforeIdx;
    drag.targetIdx = finalIdx;

    // Skip no-op drop marker when drop spot is the item's own slot
    if (insertBeforeIdx === sourceIdx || insertBeforeIdx === sourceIdx + 1) {
      delete listEl.dataset.drop;
      listEl.style.removeProperty('--drop-x');
      listEl.style.removeProperty('--drop-y');
      listEl.style.removeProperty('--drop-w');
      return;
    }

    let markerY = listRect.top;
    if (insertBeforeIdx === 0) {
      markerY = items[0].getBoundingClientRect().top;
    } else if (insertBeforeIdx >= items.length) {
      markerY = items[items.length - 1].getBoundingClientRect().bottom;
    } else {
      const prevRect = items[insertBeforeIdx - 1].getBoundingClientRect();
      const nextRect = items[insertBeforeIdx].getBoundingClientRect();
      markerY = (prevRect.bottom + nextRect.top) / 2;
    }

    listEl.dataset.drop = 'true';
    listEl.style.setProperty('--drop-x', `${listRect.left + 12}px`);
    listEl.style.setProperty('--drop-y', `${markerY}px`);
    listEl.style.setProperty('--drop-w', `${Math.max(0, listRect.width - 24)}px`);
  };

  // Start pointer drag on handle
  const handlePointerDownHandle = (
    e: React.PointerEvent<HTMLButtonElement>,
    source: SubscriptionSource,
    node: ProxyNode,
    idx: number
  ) => {
    if (e.button !== 0 || pointerDragRef.current) return;
    const listEl = listRefs.current[source.id];
    const handleEl = e.currentTarget;
    const itemEl = handleEl.closest<HTMLElement>('[data-node-id]');
    if (!listEl || !itemEl) return;

    e.preventDefault();
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {}

    document.documentElement.classList.add('is-dragging-node');
    itemEl.dataset.grabbed = 'true';
    itemEl.dataset.pointerDragging = 'true';
    itemEl.style.scale = '1.012';

    const dragState: PointerDragState = {
      pointerId: e.pointerId,
      sourceId: source.id,
      nodeId: node.id,
      sourceIdx: idx,
      targetIdx: idx,
      startY: e.clientY,
      startScrollY: window.scrollY,
      lastClientY: e.clientY,
      itemEl,
      listEl,
      handleEl,
      rafId: null,
    };
    pointerDragRef.current = dragState;

    let lastFrameTime = performance.now();
    const autoScrollLoop = (now: number) => {
      const active = pointerDragRef.current;
      if (!active) return;
      const dt = Math.min(50, now - lastFrameTime) / 1000;
      lastFrameTime = now;

      const edgeZone = Math.min(96, window.innerHeight / 3);
      const y = active.lastClientY;
      let scrollDelta = 0;
      if (y < edgeZone) {
        const ratio = Math.min(2, (edgeZone - y) / edgeZone);
        scrollDelta = -480 * ratio * dt;
      } else if (y > window.innerHeight - edgeZone) {
        const ratio = Math.min(2, (y - (window.innerHeight - edgeZone)) / edgeZone);
        scrollDelta = 480 * ratio * dt;
      }

      if (Math.abs(scrollDelta) >= 0.5) {
        window.scrollBy(0, scrollDelta);
        const dy = active.lastClientY - active.startY + (window.scrollY - active.startScrollY);
        active.itemEl.style.translate = `0px ${dy}px`;
        updateDropMarker(active, active.lastClientY);
      }

      active.rafId = requestAnimationFrame(autoScrollLoop);
    };
    dragState.rafId = requestAnimationFrame(autoScrollLoop);

    const cleanupDragVisuals = () => {
      const active = pointerDragRef.current;
      if (!active) return;
      if (active.rafId !== null) {
        cancelAnimationFrame(active.rafId);
      }
      document.documentElement.classList.remove('is-dragging-node');
      delete active.listEl.dataset.drop;
      active.listEl.style.removeProperty('--drop-x');
      active.listEl.style.removeProperty('--drop-y');
      active.listEl.style.removeProperty('--drop-w');
      delete active.itemEl.dataset.grabbed;
      delete active.itemEl.dataset.pointerDragging;
      active.itemEl.style.removeProperty('translate');
      active.itemEl.style.removeProperty('scale');
      try {
        if (active.handleEl.hasPointerCapture(active.pointerId)) {
          active.handleEl.releasePointerCapture(active.pointerId);
        }
      } catch {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown, true);
      pointerDragRef.current = null;
    };

    const onPointerMove = (ev: PointerEvent) => {
      const active = pointerDragRef.current;
      if (!active || ev.pointerId !== active.pointerId) return;
      active.lastClientY = ev.clientY;
      const dy = ev.clientY - active.startY + (window.scrollY - active.startScrollY);
      active.itemEl.style.translate = `0px ${dy}px`;
      updateDropMarker(active, ev.clientY);
    };

    const onPointerUp = (ev: PointerEvent) => {
      const active = pointerDragRef.current;
      if (!active || ev.pointerId !== active.pointerId) return;
      const { sourceIdx, targetIdx, itemEl: draggedEl, handleEl: hEl } = active;
      const releasedDy = ev.clientY - active.startY + (window.scrollY - active.startScrollY);
      cleanupDragVisuals();

      if (sourceIdx !== targetIdx) {
        const currentNodes = source.nodes || [];
        const nextNodes = [...currentNodes];
        const [moved] = nextNodes.splice(sourceIdx, 1);
        nextNodes.splice(targetIdx, 0, moved);
        runReorderWithFlip(
          source.id,
          () => {
            commitNodeOrder(source, nextNodes);
          },
          moved.id,
          releasedDy
        );
        requestAnimationFrame(() => {
          draggedEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          hEl.focus({ preventScroll: true });
        });
        announceReorder(`已将节点 ${moved.name} 移至第 ${targetIdx + 1} 位（共 ${nextNodes.length} 个）`, 500);
      } else if (Math.abs(releasedDy) > 2 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        draggedEl.animate(
          [{ translate: `0px ${releasedDy}px` }, { translate: '0px 0px' }],
          { duration: 150, easing: 'ease-out' }
        );
      }
    };

    const onPointerCancel = (ev: PointerEvent) => {
      const active = pointerDragRef.current;
      if (!active || ev.pointerId !== active.pointerId) return;
      cleanupDragVisuals();
      announceReorder(`已取消移动节点 ${node.name}`);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && pointerDragRef.current) {
        ev.preventDefault();
        ev.stopPropagation();
        const active = pointerDragRef.current;
        const releasedDy = active.lastClientY - active.startY + (window.scrollY - active.startScrollY);
        const el = active.itemEl;
        cleanupDragVisuals();
        if (Math.abs(releasedDy) > 2 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          el.animate(
            [{ translate: `0px ${releasedDy}px` }, { translate: '0px 0px' }],
            { duration: 150, easing: 'ease-out' }
          );
        }
        announceReorder(`已取消移动节点 ${node.name}`);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown, true);
  };

  // Keyboard Grab-Move-Drop handler on drag handle
  const handleKeyDownHandle = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    source: SubscriptionSource,
    node: ProxyNode,
    idx: number
  ) => {
    const isGrabbed = kbGrabbedNode?.sourceId === source.id && kbGrabbedNode?.nodeId === node.id;

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!isGrabbed) {
        setKbGrabbedNode({
          sourceId: source.id,
          nodeId: node.id,
          initialNodes: [...(source.nodes || [])],
        });
        announceReorder(
          `已抓取节点 ${node.name}（当前第 ${idx + 1} 位），按上下方向键移动，按空格或回车放下，按 Esc 取消`
        );
      } else {
        setKbGrabbedNode(null);
        announceReorder(`已放下节点 ${node.name}，当前位于第 ${idx + 1} 位`);
      }
      return;
    }

    if (!isGrabbed) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      const initial = kbGrabbedNode.initialNodes;
      setKbGrabbedNode(null);
      runReorderWithFlip(
        source.id,
        () => {
          commitNodeOrder(source, initial);
        },
        node.id
      );
      announceReorder(`已取消移动节点 ${node.name}，恢复原位`);
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const targetIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
      const currentNodes = source.nodes || [];
      if (targetIdx < 0 || targetIdx >= currentNodes.length) return;
      handleMoveNode(source, idx, targetIdx, '.node-drag-handle');
    }
  };



  const isSourceManual = (s: SubscriptionSource) => {
    if (s.type === 'manual' || s.type === 'custom' || s.id === 'custom') return true;
    if (!s.url || typeof s.url !== 'string' || !s.url.trim()) return true;
    const trimmed = s.url.trim().toLowerCase();
    return !trimmed.startsWith('http://') && !trimmed.startsWith('https://');
  };

  // Partition sources: Manual Node Groups vs Remote Subscriptions
  const customSources = useMemo(() => {
    return sources.filter(isSourceManual).sort((a, b) => a.name.localeCompare(b.name));
  }, [sources]);

  const networkSources = useMemo(() => {
    return sources.filter(s => !isSourceManual(s)).sort((a, b) => a.name.localeCompare(b.name));
  }, [sources]);

  // Unified list: Manual groups first, then Network Subscriptions
  const unifiedSources = useMemo(() => {
    return [...customSources, ...networkSources];
  }, [customSources, networkSources]);

  // Total nodes count
  const totalNodesCount = useMemo(() => {
    return sources.reduce((acc, s) => acc + (s.nodes?.length || s.nodeCount || 0), 0);
  }, [sources]);

  // Toggle accordion expand
  const toggleExpand = (sourceId: string) => {
    setExpandedSourceIds(prev => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  // Open import modal targeting a specific group
  const handleOpenImportModal = (groupId?: string) => {
    const defaultGroup = groupId || customSources[0]?.id || 'custom';
    setTargetGroupId(defaultGroup);
    setCustomText('');
    setCustomReplaceAll(false);
    setShowImportNodesModal(true);
  };

  // Open bulk edit modal for subscription text
  const handleOpenBulkEditModal = (source: SubscriptionSource) => {
    setBulkEditingSource(source);
    const nodes = source.nodes || [];
    const text = nodes
      .map(node => (typeof node.raw === 'string' && node.raw.trim()) ? node.raw.trim() : nodeToUri(node))
      .filter(Boolean)
      .join('\n');
    setBulkEditText(text);
    setBulkEditCopied(false);
    setShowBulkEditModal(true);
  };

  const handleBulkEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkEditingSource || isSubmitting) return;
    if (!bulkEditText.trim()) {
      if (!confirm(`文本内容为空，保存后将清空【${bulkEditingSource.name}】中的所有节点，确定继续吗？`)) {
        return;
      }
    }
    setIsSubmitting(true);
    try {
      await onImportCustomNodes(bulkEditText, true, bulkEditingSource.id);
      setShowBulkEditModal(false);
      setBulkEditingSource(null);
    } catch (err: any) {
      console.error('Failed to bulk edit subscription text:', err);
      alert(err.message || '更新失败，请检查节点文本格式');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyBulkEditText = async () => {
    if (!bulkEditText) return;
    const ok = await copyToClipboard(bulkEditText);
    if (ok) {
      setBulkEditCopied(true);
      setTimeout(() => setBulkEditCopied(false), 2000);
    }
  };

  const handleClearNodes = async (source: SubscriptionSource) => {
    if (!confirm(`确定要清空节点组【${source.name}】中的所有节点吗？`)) return;
    try {
      setIsSubmitting(true);
      await fetch(`/api/sources/${source.id}/clear-nodes`, { method: 'POST' });
      await onUpdateSource(source.id, { nodes: [], nodeCount: 0 });
    } catch (err: any) {
      alert(err.message || '清空节点失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open edit modal for network source
  const handleOpenEditNetworkModal = (source: SubscriptionSource) => {
    setEditingNetworkSource(source);
    setNewNetworkName(source.name);
    setNewNetworkUrl(source.url || '');
    setNewNetworkType(source.type || 'auto');
    setShowAddNetworkModal(true);
  };

  // Submit network source (create or edit)
  const handleAddNetworkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNetworkName.trim() || !newNetworkUrl.trim()) return;
    setIsSubmitting(true);
    try {
      if (editingNetworkSource) {
        await onUpdateSource(editingNetworkSource.id, {
          name: newNetworkName.trim(),
          url: newNetworkUrl.trim(),
          type: newNetworkType,
        });
      } else {
        await onAddSource({
          name: newNetworkName.trim(),
          url: newNetworkUrl.trim(),
          type: newNetworkType,
        });
      }
      setNewNetworkName('');
      setNewNetworkUrl('');
      setNewNetworkType('auto');
      setEditingNetworkSource(null);
      setShowAddNetworkModal(false);
    } catch (err: any) {
      console.error('Failed to save network source:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit new custom group
  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupNameInput.trim();
    if (!name) return;
    setIsSubmitting(true);
    try {
      if (onAddCustomGroup) {
        await onAddCustomGroup(name);
      } else {
        await onAddSource({ name, url: '', type: 'custom' });
      }
      setNewGroupNameInput('');
      setShowCreateGroupModal(false);
    } catch (err: any) {
      alert(err.message || '创建节点组失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit rename source
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingSource || !newGroupNameInput.trim()) return;
    setIsSubmitting(true);
    try {
      await onUpdateSource(renamingSource.id, { name: newGroupNameInput.trim() });
      setRenamingSource(null);
      setNewGroupNameInput('');
    } catch (err: any) {
      alert(err.message || '重命名失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit edit node (name and configuration text)
  const handleEditNodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNode || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (onUpdateCustomNode) {
        await onUpdateCustomNode(editingNode.id, {
          name: editNodeNameInput.trim(),
          text: editNodeTextInput.trim(),
          raw: editNodeTextInput.trim(),
          detour: editNodeDetourInput.trim(),
        } as any);
      }
      setEditingNode(null);
      setEditNodeNameInput('');
      setEditNodeTextInput('');
      setEditNodeDetourInput('');
    } catch (err: any) {
      alert(err.message || '修改节点配置失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit import nodes
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onImportCustomNodes(customText, customReplaceAll, targetGroupId);
      setCustomText('');
      setShowImportNodesModal(false);
      // Auto-expand the target group
      setExpandedSourceIds(prev => new Set([...prev, targetGroupId]));
    } catch (err: any) {
      alert(err.message || '导入节点失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single refresh
  const handleSingleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await onRefreshSource(id);
    } finally {
      setRefreshingId(null);
    }
  };

  // Copy node URI or info (robust with fallback for HTTP / non-secure contexts)
  const handleCopyNode = async (node: ProxyNode) => {
    try {
      const textToCopy = (typeof node.raw === 'string' && node.raw.trim()) ? node.raw.trim() : nodeToUri(node);
      const ok = await copyToClipboard(textToCopy);
      if (ok) {
        setCopiedNodeId(node.id);
        setTimeout(() => setCopiedNodeId(null), 1500);
      } else {
        window.prompt('请手动复制节点链接：', textToCopy);
      }
    } catch (err) {
      console.error('handleCopyNode error:', err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      <p id="node-reorder-status" role="status" className="visually-hidden">
        {reorderAnnouncement}
      </p>

      {/* 1. 顶部操作栏卡片 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 bg-white p-4 rounded-2xl border border-[#E3DDD2] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#CC785C]" />
            <h1 className="text-base font-bold text-[#1F1E1D]">订阅与节点</h1>
            <span className="px-2.5 py-0.5 bg-[#FAF0EC] text-[#B85D3F] rounded-md font-mono text-xs font-bold border border-[#F3DDD3]">
              共 {totalNodesCount} 节点
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-[#78746D] flex-wrap">
            <span className="text-[#D0C9BD]">•</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FAF8F5] border border-[#E8E4DC] text-[#59554E] text-[11px] font-medium">
              <span>{customSources.length} 独立组</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EAF2EE] border border-[#D5E5DE] text-[#2D6A5A] text-[11px] font-medium">
              <span>{networkSources.length} 网络订阅</span>
            </span>
          </div>
        </div>

        {/* 顶部操作按钮组 */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => handleOpenImportModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>导入节点</span>
          </button>

          <button
            onClick={() => {
              setEditingNetworkSource(null);
              setNewNetworkName('');
              setNewNetworkUrl('');
              setNewNetworkType('auto');
              setShowAddNetworkModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold btn-claude-secondary rounded-xl shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>添加订阅</span>
          </button>

          <button
            onClick={() => {
              setNewGroupNameInput('');
              setShowCreateGroupModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold btn-claude-secondary rounded-xl shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>新建节点组</span>
          </button>
        </div>
      </div>

      {/* 2. 统一卡片流（自建组自然置顶，网络订阅紧随其后） */}
      <div className="space-y-3">
        {unifiedSources.map(source => {
          const isCustom = isSourceManual(source);
          const isExpanded = expandedSourceIds.has(source.id);
          const isThisRefreshing = refreshingId === source.id;
          const nodesList = source.nodes || [];

          return (
            <div
              key={source.id}
              className={`rounded-2xl border transition-all duration-200 bg-white overflow-hidden shadow-2xs ${source.enabled !== false
                ? isExpanded
                  ? 'border-[#CC785C]/60 shadow-sm'
                  : 'border-[#E3DDD2] hover:border-[#CC785C]/40'
                : 'border-[#E8E4DC] opacity-65 bg-[#FAF8F5]'
                }`}
            >
              {/* 卡片主横条 (Header) */}
              <div
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${isExpanded ? 'bg-[#FCFAF7]' : 'hover:bg-[#FCFBF9]'
                  }`}
                onClick={() => toggleExpand(source.id)}
              >
                {/* 左侧：类型徽章、名称、节点数、副标题 */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* 折叠展开箭头指示器 */}
                  <div className="mt-0.5 shrink-0 text-[#8C877D] hover:text-[#1F1E1D] transition-transform duration-200">
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-[#CC785C]' : ''
                        }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 类型徽章 */}
                      {isCustom ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#FBF2EA] text-[#C45E38] border border-[#F2D8C9] shrink-0 font-mono">
                          独立组
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#EAF2EE] text-[#2D6A5A] border border-[#D5E5DE] shrink-0 font-mono">
                          订阅
                        </span>
                      )}

                      {/* 标题 */}
                      <h3 className={`text-xs font-bold truncate max-w-xs sm:max-w-md ${source.enabled === false ? 'text-[#8C877D]' : 'text-[#1F1E1D]'}`}>
                        {source.name}
                      </h3>

                      {/* 节点数徽章 */}
                      <span className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded shrink-0 ${source.enabled === false ? 'bg-[#ECE8E1] text-[#9E9A91]' : 'bg-[#F0ECE4] text-[#59554E]'}`}>
                        {nodesList.length} 节点
                      </span>

                      {/* 停用状态提示徽章 */}
                      {source.enabled === false && (
                        <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded bg-[#F0EBE1] text-[#8C877D] border border-[#DDD6C9] shrink-0">
                          已停用 (不导出)
                        </span>
                      )}
                    </div>

                    {/* 卡片副信息 */}
                    {/* 更新时间提示 */}
                    {source.lastUpdated && (
                      <div className="text-[10px] text-[#9E9A91]">
                        最后同步: {new Date(source.lastUpdated).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* 右侧快捷操作按钮 */}
                <div
                  className="flex items-center gap-1 self-end sm:self-center shrink-0"
                  onClick={e => e.stopPropagation()}
                >
                  {/* 自建独立组操作 */}
                  {isCustom && (
                    <>
                      <button
                        onClick={() => handleOpenBulkEditModal(source)}
                        className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D] hover:bg-[#EFEAE2]/60 rounded-lg transition-colors cursor-pointer"
                        title="批量编辑节点文本"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleOpenImportModal(source.id)}
                        className="p-1.5 text-[#CC785C] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors cursor-pointer"
                        title="导入节点到此组"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {nodesList.length > 0 && (
                        <button
                          onClick={() => handleClearNodes(source)}
                          className="p-1.5 text-[#8C877D] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors cursor-pointer"
                          title="清空此组所有节点"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setRenamingSource(source);
                          setNewGroupNameInput(source.name);
                        }}
                        className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D] hover:bg-[#EFEAE2]/60 rounded-lg transition-colors cursor-pointer"
                        title="重命名节点组"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>


                      <button
                        onClick={() => {
                          if (confirm(`确定要删除节点组【${source.name}】吗？`)) {
                            onDeleteSource(source.id);
                          }
                        }}
                        className="p-1.5 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors cursor-pointer"
                        title="删除节点组"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {/* 网络订阅专属操作 */}
                  {!isCustom && (
                    <>
                      <button
                        onClick={() => handleOpenEditNetworkModal(source)}
                        className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded-lg transition-colors cursor-pointer"
                        title="编辑订阅源"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleSingleRefresh(source.id)}
                        disabled={isThisRefreshing}
                        className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        title="刷新订阅"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-[#CC785C] ${isThisRefreshing ? 'animate-spin' : ''}`} />
                      </button>

                      <button
                        onClick={() => onUpdateSource(source.id, { enabled: !source.enabled })}
                        className="p-1.5 text-[#8C877D] hover:text-[#1F1E1D] hover:bg-[#EFEAE2]/60 rounded-lg transition-colors cursor-pointer"
                        title={source.enabled !== false ? '点击停用' : '点击启用'}
                      >
                        {source.enabled !== false ? (
                          <CheckCircle2 className="w-4 h-4 text-[#367A68]" />
                        ) : (
                          <XCircle className="w-4 h-4 text-[#9E9A91]" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`确定要删除订阅源【${source.name}】吗？`)) {
                            onDeleteSource(source.id);
                          }
                        }}
                        className="p-1.5 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors cursor-pointer"
                        title="删除订阅源"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 3. 展开区域：就地查看节点详情 (Accordion) */}
              {isExpanded && (
                <div className="border-t border-[#F0ECE4] bg-white p-4 animate-in fade-in duration-150 space-y-2.5">
                  {nodesList.length > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[#78746D]">
                      <div className="flex items-center gap-1.5">
                        <ArrowUpDown className="w-3.5 h-3.5 text-[#CC785C]" />
                        <span>拖拽左侧手柄或点击右侧箭头可调整节点顺序</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[#9E9A91]">快捷排序:</span>
                        <button
                          type="button"
                          onClick={() => handleQuickSortNodes(source, 'name-asc')}
                          className="px-2 py-0.5 rounded-md bg-[#FAF8F5] hover:bg-[#F0ECE4] text-[#59554E] hover:text-[#1F1E1D] border border-[#E8E4DC] transition-colors cursor-pointer font-medium"
                          title="按节点名称字母数字升序排列"
                        >
                          按名称 A→Z
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickSortNodes(source, 'reverse')}
                          className="px-2 py-0.5 rounded-md bg-[#FAF8F5] hover:bg-[#F0ECE4] text-[#59554E] hover:text-[#1F1E1D] border border-[#E8E4DC] transition-colors cursor-pointer font-medium"
                          title="反转当前节点顺序"
                        >
                          反转顺序
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 节点列表渲染 */}
                  {nodesList.length > 0 ? (
                    <div
                      ref={el => {
                        listRefs.current[source.id] = el;
                      }}
                      className="node-reorder-list rounded-xl border border-[#EBE6DC] divide-y divide-[#F0ECE4] overflow-hidden"
                    >
                      {nodesList.map((node, idx) => {
                        const isKbGrabbed =
                          kbGrabbedNode?.sourceId === source.id && kbGrabbedNode?.nodeId === node.id;
                        return (
                          <div
                            key={node.id}
                            data-node-id={node.id}
                            data-grabbed={isKbGrabbed ? 'true' : undefined}
                            onFocus={e => {
                              const target = e.target as HTMLElement;
                              if (
                                target.matches?.(':focus-visible') &&
                                e.currentTarget.getAnimations().length === 0
                              ) {
                                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                              }
                            }}
                            className="node-item px-3 py-2 hover:bg-[#FAF8F5] transition-colors flex items-center justify-between gap-2.5 text-xs group/item"
                          >
                            {/* 左侧：拖拽手柄、节点名、协议类型、服务器端口 */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {nodesList.length > 1 && (
                                <button
                                  type="button"
                                  aria-label={`调整节点 ${node.name} 的顺序（当前第 ${idx + 1} 位）`}
                                  aria-pressed={isKbGrabbed}
                                  onPointerDown={e => handlePointerDownHandle(e, source, node, idx)}
                                  onKeyDown={e => handleKeyDownHandle(e, source, node, idx)}
                                  onBlur={() => {
                                    if (isKbGrabbed) {
                                      setKbGrabbedNode(null);
                                    }
                                  }}
                                  className="node-drag-handle p-1 -ml-1 text-[#B5AFA4] hover:text-[#59554E] rounded transition-colors shrink-0"
                                  title="按住上下拖拽调整顺序（键盘按空格抓取后用方向键移动）"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                <span className="font-bold text-[#1F1E1D] truncate max-w-md">
                                  {node.name}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                  <span className="px-1.5 py-0.2 bg-[#F0ECE4] text-[#59554E] rounded text-[10px] font-mono font-bold">
                                    {(node.type || 'vless').toUpperCase()}
                                  </span>
                                  {node.detour && (
                                    <span className="px-1.5 py-0.2 bg-[#FAF0EC] text-[#CC785C] border border-[#F3D5CA] rounded text-[10px] font-medium">
                                      {node.detour}
                                    </span>
                                  )}
                                  <span className="text-[11px] font-mono text-[#8C877D] truncate">
                                    {node.server}:{node.port}
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="hidden group-has-[.node-drag-handle:focus-visible]/item:inline-block text-[10px] text-[#CC785C] bg-[#FAF0EC] px-1.5 py-0.2 rounded border border-[#F3DDD3]"
                                  >
                                    {isKbGrabbed
                                      ? '↑↓ 移动 · Space 放下 · Esc 取消'
                                      : 'Space 抓取排序'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 右侧微操作：置顶、上移、下移、复制链接、改名、删除自建节点 */}
                            <div className="flex items-center gap-1 shrink-0">
                              {nodesList.length > 1 && (
                                <div className="flex items-center gap-0.5 mr-1 pr-1 border-r border-[#EBE6DC]">
                                  <button
                                    type="button"
                                    data-move-btn="top"
                                    disabled={idx === 0}
                                    onClick={() =>
                                      handleMoveNode(source, idx, 0, '[data-move-btn="down"]')
                                    }
                                    className="p-1 text-[#9E9A91] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                                    title="置顶此节点"
                                    aria-label={`置顶节点 ${node.name}`}
                                  >
                                    <ArrowUpToLine className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    data-move-btn="up"
                                    disabled={idx === 0}
                                    onClick={() =>
                                      handleMoveNode(source, idx, idx - 1, '[data-move-btn="up"]')
                                    }
                                    className="p-1 text-[#9E9A91] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                                    title="上移一位"
                                    aria-label={`上移节点 ${node.name}`}
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    data-move-btn="down"
                                    disabled={idx === nodesList.length - 1}
                                    onClick={() =>
                                      handleMoveNode(source, idx, idx + 1, '[data-move-btn="down"]')
                                    }
                                    className="p-1 text-[#9E9A91] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                                    title="下移一位"
                                    aria-label={`下移节点 ${node.name}`}
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}

                              <button
                                onClick={() => handleCopyNode(node)}
                                className="p-1 text-[#9E9A91] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded transition-colors cursor-pointer"
                                title="复制节点链接"
                              >
                                {copiedNodeId === node.id ? (
                                  <Check className="w-3.5 h-3.5 text-[#367A68]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                onClick={() => {
                                  const uriText = (typeof node.raw === 'string' && node.raw.trim()) ? node.raw.trim() : nodeToUri(node);
                                  setEditingNode({ id: node.id, name: node.name, rawText: uriText, detour: node.detour });
                                  setEditNodeNameInput(node.name);
                                  setEditNodeTextInput(uriText);
                                  setEditNodeDetourInput(node.detour || '');
                                }}
                                className="p-1 text-[#9E9A91] hover:text-[#1F1E1D] hover:bg-[#EFEAE2] rounded transition-colors cursor-pointer"
                                title="修改节点与配置文本"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {isCustom && (
                                <button
                                  onClick={() => {
                                    if (confirm(`确定要删除节点【${node.name}】吗？`)) {
                                      onDeleteCustomNode(node.id);
                                    }
                                  }}
                                  className="p-1 text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded transition-colors cursor-pointer"
                                  title="删除此节点"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl border border-dashed border-[#DFD9CF] text-center space-y-2">
                      <p className="text-xs font-medium text-[#8C877D]">
                        该组暂无节点
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {unifiedSources.length === 0 && (
          <div className="p-12 rounded-2xl bg-white border border-dashed border-[#DFD9CF] text-center space-y-3">
            <Layers className="w-8 h-8 text-[#9E9A91] mx-auto opacity-50" />
            <p className="text-xs font-medium text-[#78746D]">暂无任何订阅或独立节点组</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handleOpenImportModal()}
                className="px-3 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl"
              >
                贴入独立节点
              </button>
              <button
                onClick={() => setShowAddNetworkModal(true)}
                className="px-3 py-1.5 text-xs font-semibold btn-claude-secondary rounded-xl"
              >
                添加网络订阅链接
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 弹窗 1：添加/编辑网络机场订阅弹窗 */}
      {showAddNetworkModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-md p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <div>
                <h3 className="text-sm font-bold text-[#1F1E1D]">
                  {editingNetworkSource ? '编辑网络订阅源' : '添加网络订阅源'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowAddNetworkModal(false);
                  setEditingNetworkSource(null);
                }}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNetworkSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">订阅源名称</label>
                <input
                  type="text"
                  required
                  placeholder=""
                  value={newNetworkName}
                  onChange={e => setNewNetworkName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">订阅 URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://airport.com/api/v1/client/subscribe?token=..."
                  value={newNetworkUrl}
                  onChange={e => setNewNetworkUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">格式解析模式</label>
                <select
                  value={newNetworkType}
                  onChange={e => setNewNetworkType(e.target.value as NonNullable<SubscriptionSource['type']>)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                >
                  <option value="auto">自动识别 (Auto)</option>
                  <option value="clash">Clash YAML</option>
                  <option value="singbox">Singbox JSON</option>
                  <option value="base64">Base64 编码节点串</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddNetworkModal(false);
                    setEditingNetworkSource(null);
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? '保存中...' : (editingNetworkSource ? '保存更改' : '添加并拉取')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗：编辑所有订阅文本 */}
      {showBulkEditModal && bulkEditingSource && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-2xl w-full max-w-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#FAF0EC] text-[#CC785C]">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#1F1E1D]">批量编辑节点文本</h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#FBF2EA] text-[#C45E38] border border-[#F2D8C9]">
                      {bulkEditingSource.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#78746D]">
                    直接查看或批量修改此组包含的所有节点链接，保存将自动重新解析并覆盖更新。
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkEditingSource(null);
                }}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D] p-1.5 hover:bg-[#FAF8F5] rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBulkEditSubmit} className="space-y-3.5">
              {/* 工具栏：统计与快捷操作 */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#78746D]">
                  <span className="font-medium text-[#1F1E1D]">
                    共 {bulkEditText ? bulkEditText.split('\n').filter(l => l.trim().length > 0).length : 0} 行
                  </span>
                  <span>·</span>
                  <span>原包含 {bulkEditingSource.nodes?.length || 0} 个节点</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyBulkEditText}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#59554E] hover:text-[#1F1E1D] bg-[#FAF8F5] hover:bg-[#F0ECE4] border border-[#E3DDD2] rounded-lg transition-colors cursor-pointer"
                    title="复制所有文本到剪贴板"
                  >
                    {bulkEditCopied ? (
                      <>
                        <Check className="w-3 h-3 text-[#367A68]" />
                        <span className="text-[#367A68]">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>复制全部</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkEditText('')}
                    className="px-2.5 py-1 text-[11px] font-medium text-[#9E9A91] hover:text-[#B85D3F] hover:bg-[#FAF0EC] rounded-lg transition-colors cursor-pointer"
                    title="清空文本框"
                  >
                    清空
                  </button>
                </div>
              </div>

              {/* 文本编辑区域 */}
              <div>
                <textarea
                  rows={13}
                  value={bulkEditText}
                  onChange={e => setBulkEditText(e.target.value)}
                  placeholder={`支持每行一个节点链接：\nvless://...\nhysteria2://...\nss://...\ntrojan://...\n或完整的 Clash YAML / Singbox JSON`}
                  className="w-full px-3.5 py-2.5 text-xs font-mono bg-[#FAF8F5] border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] focus:bg-white resize-y break-all leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-[#8C877D]">
                  💡 提示：保存后将使用此文本完全覆盖更新该组的节点
                </p>

                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBulkEditModal(false);
                      setBulkEditingSource(null);
                    }}
                    className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? '保存更新中...' : '保存修改'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 2：批量贴入 / 添加自建独立节点弹窗 */}
      {showImportNodesModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <div>
                <h3 className="text-sm font-bold text-[#1F1E1D]">批量贴入独立节点</h3>
              </div>
              <button
                onClick={() => setShowImportNodesModal(false)}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D] p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-3.5">
              {/* 目标节点组选择 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#1F1E1D]">存入独立节点组</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewGroupNameInput('');
                      setShowCreateGroupModal(true);
                    }}
                    className="text-[11px] text-[#CC785C] hover:underline font-medium"
                  >
                    + 新建独立节点组
                  </button>
                </div>
                <select
                  value={targetGroupId}
                  onChange={e => setTargetGroupId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                >
                  {customSources.map(cs => (
                    <option key={cs.id} value={cs.id}>
                      {cs.name} ({cs.nodes?.length || 0} 个节点)
                    </option>
                  ))}
                </select>
              </div>

              {/* 链接文本输入域 */}
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">节点链接 / 片段</label>
                <textarea
                  required
                  rows={9}
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  className="w-full px-3 py-2 text-[11px] font-mono bg-[#FAF8F5] border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportNodesModal(false)}
                    className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50"
                  >
                    {isSubmitting ? '解析导入中...' : '解析并存入'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 3：新建自建组弹窗 */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <h3 className="text-sm font-bold text-[#1F1E1D]">新建独立节点组</h3>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">节点组名称</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder=""
                  value={newGroupNameInput}
                  onChange={e => setNewGroupNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? '创建中...' : '立即创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗 4：重命名节点组弹窗 */}
      {renamingSource && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3DDD2] shadow-xl w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
              <h3 className="text-sm font-bold text-[#1F1E1D]">重命名节点组</h3>
              <button
                onClick={() => setRenamingSource(null)}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">新组名</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newGroupNameInput}
                  onChange={e => setNewGroupNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingSource(null)}
                  className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50"
                >
                  {isSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 编辑节点与配置文本弹窗 */}
      {editingNode && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#FAF8F5] border border-[#E3DDD2] rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#CC785C]" />
                <h3 className="text-sm font-bold text-[#1F1E1D]">编辑节点配置</h3>
              </div>
              <button
                onClick={() => {
                  setEditingNode(null);
                  setEditNodeDetourInput('');
                }}
                className="text-xs text-[#9E9A91] hover:text-[#1F1E1D] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditNodeSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#1F1E1D] mb-1">
                  节点名称
                </label>
                <input
                  type="text"
                  required
                  value={editNodeNameInput}
                  onChange={e => setEditNodeNameInput(e.target.value)}
                  placeholder="节点备注名称"
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#1F1E1D]">
                    配置内容文本
                  </label>
                  <span className="text-[10px] text-[#8C877D]">支持修改 URI 链接 / 参数</span>
                </div>
                <textarea
                  rows={5}
                  value={editNodeTextInput}
                  onChange={e => setEditNodeTextInput(e.target.value)}
                  placeholder="vless://... 或 hysteria2://... 或 ss://... 等节点链接"
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C] resize-y break-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#1F1E1D]">
                    底层出口 (Detour)
                  </label>
                  <span className="text-[10px] text-[#8C877D]">指定握手建立隧道的物理宽带出口</span>
                </div>
                {availableDetourOutbounds.length > 0 ? (
                  <select
                    value={editNodeDetourInput}
                    onChange={e => setEditNodeDetourInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                  >
                    <option value="">默认 (系统默认出口)</option>
                    {availableDetourOutbounds.map(tag => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                    {editNodeDetourInput && !availableDetourOutbounds.includes(editNodeDetourInput) && (
                      <option value={editNodeDetourInput}>{editNodeDetourInput}</option>
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editNodeDetourInput}
                    onChange={e => setEditNodeDetourInput(e.target.value)}
                    placeholder="默认 (系统默认出口) - 留空即默认，或输入指定出口标签"
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E3DDD2] rounded-xl text-[#1F1E1D] focus:outline-none focus:border-[#CC785C]"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E8E2D8]">
                <button
                  type="button"
                  onClick={() => {
                    setEditingNode(null);
                    setEditNodeDetourInput('');
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium btn-claude-secondary rounded-xl cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold btn-claude-primary rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? '保存中...' : '保存更改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
};
