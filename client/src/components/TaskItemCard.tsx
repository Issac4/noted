import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Calendar,
} from "lucide-react";
import type { Task, Member, UpdateTaskPayload } from "@todo-app/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDaysLeftInfo, isTaskForTomorrow } from "@/lib/nlp";
import { triggerHaptic } from "@/lib/haptics";

interface TaskItemCardProps {
  task: Task;
  creator?: Member;
  assignee?: Member;
  showOwner?: boolean;
  isCriticalCard?: boolean;
  onUpdate: (id: string, patch: UpdateTaskPayload) => void;
  onDelete: (id: string) => void;
}

export const TaskItemCard: React.FC<TaskItemCardProps> = ({
  task,
  creator,
  assignee,
  showOwner = false,
  isCriticalCard = false,
  onUpdate,
  onDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [noteDraft, setNoteDraft] = useState(task.note ?? "");

  useEffect(() => {
    setNoteDraft(task.note ?? "");
  }, [task.note]);

  const isProxy = task.createdBy !== task.assignedTo;
  const isCompleted = task.status === "completed";
  const isTomorrow = !isCriticalCard && isTaskForTomorrow(task.dueDate);
  const daysLeftInfo = task.type === "critical" ? getDaysLeftInfo(task.dueDate) : null;

  const handleToggleComplete = () => {
    const nextStatus = isCompleted ? "pending" : "completed";
    if (nextStatus === "completed") {
      // Subtle, satisfying haptic feedback upon task completion (PRD Section 3)
      triggerHaptic([18, 30, 12]);
    } else {
      triggerHaptic(10);
    }
    onUpdate(task.id, { status: nextStatus });
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = noteDraft.trim() || null;
    onUpdate(task.id, { note: cleaned });
    setIsExpanded(false);
  };

  return (
    <div
      data-testid={isCriticalCard ? "critical-task-item" : "task-item"}
      className={`group rounded-xl border transition-all duration-150 ${
        isCriticalCard
          ? "border-amber-500/35 bg-amber-500/[0.06] hover:bg-amber-500/[0.1]"
          : isCompleted
          ? "border-border/40 bg-secondary/10 opacity-75"
          : "border-border/60 bg-secondary/20 hover:bg-secondary/35"
      }`}
    >
      <div className="flex items-start justify-between gap-3 p-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <button
            type="button"
            data-testid={`toggle-task-${task.id}`}
            onClick={handleToggleComplete}
            className={`mt-0.5 shrink-0 transition-transform active:scale-90 ${
              isCompleted
                ? "text-primary"
                : isCriticalCard
                ? "text-amber-400 hover:text-emerald-400"
                : "text-muted-foreground hover:text-primary"
            }`}
            title={isCompleted ? "Mark as pending" : "Mark completed"}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
          </button>

          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {daysLeftInfo && !isCompleted && (
                <Badge
                  variant="destructive"
                  data-testid="days-left-badge"
                  className={`text-[11px] font-semibold ${
                    daysLeftInfo.urgency === "overdue"
                      ? "bg-red-500/20 text-red-300 border-red-500/40"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  }`}
                >
                  ⚠️ {daysLeftInfo.label}:
                </Badge>
              )}

              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className={`text-left text-sm font-medium break-words hover:underline decoration-border underline-offset-4 ${
                  isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                {task.title}
              </button>

              {isTomorrow && !isCompleted && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Calendar className="w-2.5 h-2.5" />
                  Tomorrow
                </span>
              )}

              {isProxy && creator && (
                <span
                  data-testid="proxy-attribution"
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25 font-medium"
                >
                  Noted by {creator.name} 📝
                </span>
              )}
            </div>

            {/* Existing Context Note display */}
            {task.note && !isExpanded && (
              <button
                type="button"
                data-testid="task-context-note"
                onClick={() => setIsExpanded(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors text-left bg-background/50 px-2 py-1 rounded-md border border-border/50"
              >
                <FileText className="w-3 h-3 text-primary shrink-0" />
                <span className="truncate">{task.note}</span>
              </button>
            )}

            {showOwner && assignee && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-0.5">
                <span>
                  Focus: {assignee.avatar} {assignee.name}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right actions: Expand Context Note & Delete */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid={`expand-note-${task.id}`}
            onClick={() => setIsExpanded((v) => !v)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            title={task.note ? "Edit context note" : "Add context snippet (dimensions, dosage, phone)"}
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <div className="flex items-center gap-0.5 text-[11px]">
                <FileText className="w-3.5 h-3.5" />
                <ChevronDown className="w-3 h-3 opacity-70" />
              </div>
            )}
          </button>

          <button
            type="button"
            data-testid={`delete-task-${task.id}`}
            onClick={() => onDelete(task.id)}
            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable Context Note Drawer (PRD Section 2 Module 2: Context Notes) */}
      {isExpanded && (
        <form
          onSubmit={handleSaveNote}
          data-testid="context-note-editor"
          className="px-3 pb-3 pt-1 border-t border-border/40 bg-background/40 rounded-b-xl space-y-2"
        >
          <label className="block text-[11px] font-medium text-muted-foreground">
            Context Note (e.g. filter dimension <code className="text-foreground">16x25x1</code>, dosage <code className="text-foreground">500mg</code>, phone #)
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              data-testid="context-note-input"
              placeholder="Add lightweight snippet..."
              className="h-8 text-xs bg-background"
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              data-testid="context-note-save"
              className="h-8 px-2.5 text-xs gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setNoteDraft(task.note ?? "");
                setIsExpanded(false);
              }}
              className="h-8 px-2 text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
