"use client";

import { XComment } from "@/types";
import { Check, MessageSquare, ExternalLink } from "lucide-react";

interface CommentCardProps {
  comment: XComment;
  onToggleSelect?: (commentId: string) => void;
  showCheckbox?: boolean;
}

export function CommentCard({
  comment,
  onToggleSelect,
  showCheckbox = true,
}: CommentCardProps) {
  const initial = (comment.authorDisplayName || comment.authorUsername || "A")
    .charAt(0)
    .toUpperCase();

  return (
    <div
      onClick={() => onToggleSelect && onToggleSelect(comment.id)}
      className={`p-4 rounded-xl border transition-all cursor-pointer ${
        comment.isSelected
          ? "bg-sky-950/40 border-sky-500/80 shadow-md shadow-sky-500/10"
          : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/40 hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start space-x-3 min-w-0">
          {/* Avatar initial badge */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-inner">
            {initial}
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-sm font-semibold text-white truncate">
                {comment.authorDisplayName || comment.authorUsername}
              </span>
              <span className="text-xs text-sky-400 font-medium">
                @{comment.authorUsername}
              </span>
              {comment.createdAt && (
                <span className="text-[11px] text-slate-500 font-mono">
                  · {comment.createdAt}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-200 mt-1.5 leading-relaxed break-words whitespace-pre-wrap">
              {comment.text}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {comment.url && (
            <a
              href={comment.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open comment on X"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {showCheckbox && (
            <button
              type="button"
              onClick={() => onToggleSelect && onToggleSelect(comment.id)}
              className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                comment.isSelected
                  ? "bg-sky-500 border-sky-400 text-white shadow-sm"
                  : "bg-slate-900 border-slate-700 text-transparent hover:border-slate-500"
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
