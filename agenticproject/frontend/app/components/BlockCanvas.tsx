"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Tooltip from "./Tooltip";
import type { ResumeEntry, ResumeBlock } from "../lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface BlockCanvasProps {
  entries: ResumeEntry[];
  onEntriesChange: (entries: ResumeEntry[]) => void;
  jobDescription: string;
  getToken: () => Promise<string | null>;
}

export default function BlockCanvas({ entries, onEntriesChange, jobDescription, getToken }: BlockCanvasProps) {
  const updateEntry = (entryId: string, updater: (entry: ResumeEntry) => ResumeEntry) => {
    onEntriesChange(entries.map((e) => (e.id === entryId ? updater(e) : e)));
  };

  return (
    <div className="space-y-6">
      <AnimatePresence initial={false}>
        {entries.map((entry) => (
          <motion.div
            key={entry.id}
            layout
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <EntryCard
              entry={entry}
              jobDescription={jobDescription}
              getToken={getToken}
              onChange={(updater) => updateEntry(entry.id, updater)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function EntryCard({
  entry, jobDescription, getToken, onChange,
}: {
  entry: ResumeEntry;
  jobDescription: string;
  getToken: () => Promise<string | null>;
  onChange: (updater: (entry: ResumeEntry) => ResumeEntry) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !entry.blocks) return;
    const oldIndex = entry.blocks.findIndex((b) => b.id === active.id);
    const newIndex = entry.blocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange((e) => ({ ...e, blocks: arrayMove(e.blocks!, oldIndex, newIndex) }));
  };

  const updateBlock = (blockId: string, updater: (b: ResumeBlock) => ResumeBlock) => {
    onChange((e) => ({
      ...e,
      blocks: e.blocks ? e.blocks.map((b) => (b.id === blockId ? updater(b) : b)) : e.blocks,
    }));
  };

  const cycleAlternate = (blockId: string) => {
    updateBlock(blockId, (b) => ({
      ...b,
      activeIndex: b.candidates.length ? (b.activeIndex + 1) % b.candidates.length : 0,
    }));
  };

  const regenerateBlock = async (block: ResumeBlock) => {
    updateBlock(block.id, (b) => ({ ...b, isRegenerating: true }));
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/regenerate-block`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          section_title: `${entry.title} @ ${entry.company}`,
          original_text: block.original,
          current_text: block.candidates[block.activeIndex] ?? block.original,
          job_description: jobDescription,
        }),
      });
      if (!res.ok) throw new Error(`Regenerate failed (${res.status})`);
      const data = await res.json();
      updateBlock(block.id, (b) => ({
        ...b,
        candidates: [data.chosen, ...(data.alternates ?? [])],
        activeIndex: 0,
        score: data.score ?? b.score,
        isRegenerating: false,
      }));
    } catch {
      updateBlock(block.id, (b) => ({ ...b, isRegenerating: false }));
    }
  };

  const editBlock = (blockId: string, newText: string) => {
    updateBlock(blockId, (b) => {
      const candidates = [...b.candidates];
      candidates[b.activeIndex] = newText;
      return { ...b, candidates };
    });
  };

  return (
    <div className="border border-stone-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 bg-stone-50/60 border-b border-stone-100">
        <div className="flex justify-between items-baseline">
          <h4 className="font-bold text-stone-900 text-sm">{entry.title || "Role"}</h4>
          <span className="text-xs text-stone-500">{entry.dates}</span>
        </div>
        <div className="flex justify-between items-baseline mt-0.5">
          <span className="text-xs italic text-stone-500">{entry.company}</span>
          <span className="text-xs italic text-stone-400">{entry.location}</span>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {entry.blocks === null ? (
          <>
            <SkeletonBullet />
            <SkeletonBullet />
          </>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={entry.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <AnimatePresence initial={false}>
                {entry.blocks.map((block) => (
                  <BlockBullet
                    key={block.id}
                    block={block}
                    onCycle={() => cycleAlternate(block.id)}
                    onRegenerate={() => regenerateBlock(block)}
                    onEdit={(text) => editBlock(block.id, text)}
                  />
                ))}
              </AnimatePresence>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function BlockBullet({
  block, onCycle, onRegenerate, onEdit,
}: {
  block: ResumeBlock;
  onCycle: () => void;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const activeText = block.candidates[block.activeIndex] ?? block.original;
  const hasAlternates = block.candidates.length > 1;
  const scorePct = Math.round((block.score ?? 0) * 100);
  const scoreColor = scorePct >= 50 ? "text-emerald-600 bg-emerald-50 border-emerald-100"
    : scorePct >= 20 ? "text-amber-600 bg-amber-50 border-amber-100"
    : "text-stone-400 bg-stone-50 border-stone-100";

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className={`group flex items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
        block.isRegenerating ? "border-primary-200 bg-primary-50/30" : "border-stone-100 hover:border-stone-200"
      }`}
    >
      <Tooltip content="Drag to reorder" side="left">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 flex-shrink-0"
          aria-label="Drag to reorder"
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.3" /><circle cx="9" cy="3" r="1.3" />
            <circle cx="3" cy="8" r="1.3" /><circle cx="9" cy="8" r="1.3" />
            <circle cx="3" cy="13" r="1.3" /><circle cx="9" cy="13" r="1.3" />
          </svg>
        </button>
      </Tooltip>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              className="w-full text-xs text-stone-700 border border-primary-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { onEdit(draft); setIsEditing(false); }}
                className="text-xs font-semibold text-white bg-stone-900 px-2.5 py-1 rounded-lg"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs font-medium text-stone-500 px-2.5 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className={`text-xs leading-relaxed ${block.isRegenerating ? "text-stone-400" : "text-stone-700"}`}>
            {activeText}
          </p>
        )}

        {!isEditing && (
          <div className="flex items-center gap-1.5 mt-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {hasAlternates && (
              <Tooltip content={`Alternate ${block.activeIndex + 1}/${block.candidates.length} — click to cycle`}>
                <button
                  type="button"
                  onClick={onCycle}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-600 bg-primary-50 border border-primary-100 px-1.5 py-0.5 rounded-md hover:bg-primary-100"
                >
                  ⟳ {block.activeIndex + 1}/{block.candidates.length}
                </button>
              </Tooltip>
            )}
            <Tooltip content="Edit this bullet manually">
              <button
                type="button"
                onClick={() => { setDraft(activeText); setIsEditing(true); }}
                className="text-[10px] font-semibold text-stone-500 hover:text-stone-800 px-1.5 py-0.5"
              >
                Edit
              </button>
            </Tooltip>
            <Tooltip content="Get fresh AI rewrites for this bullet">
              <button
                type="button"
                onClick={onRegenerate}
                disabled={block.isRegenerating}
                className="text-[10px] font-semibold text-stone-500 hover:text-stone-800 px-1.5 py-0.5 disabled:opacity-40"
              >
                {block.isRegenerating ? "Regenerating…" : "Regenerate"}
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <Tooltip content="How closely this bullet's wording matches keywords in the job description" side="left">
        <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${scoreColor}`}>
          {scorePct}%
        </span>
      </Tooltip>
    </motion.div>
  );
}

function SkeletonBullet() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-stone-100 px-3 py-2.5">
      <div className="mt-1 w-3 h-3 rounded-full bg-stone-100 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-1.5 py-0.5">
        <div className="h-2.5 bg-stone-100 rounded animate-pulse w-[85%]" />
        <div className="h-2.5 bg-stone-100 rounded animate-pulse w-[60%]" />
      </div>
    </div>
  );
}
