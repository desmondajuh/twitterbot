"use client";

import { useState, useEffect } from "react";
import { ConfirmationRequest, ConfirmationDecision } from "@/types/electron";
import { ShieldAlert, Send, SkipForward, XCircle, ExternalLink, MessageSquare } from "lucide-react";

export function ConfirmationModal() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.desktop?.automation?.onConfirmRequest) {
      return;
    }

    const unsubscribe = window.desktop.automation.onConfirmRequest((req) => {
      setRequest(req);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleDecision = async (decision: ConfirmationDecision) => {
    if (!request || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (typeof window !== "undefined" && window.desktop?.automation?.respondConfirm) {
        await window.desktop.automation.respondConfirm(request.confirmationId, decision);
      }
    } catch (err) {
      console.error("Failed to respond to confirmation:", err);
    } finally {
      setIsSubmitting(false);
      setRequest(null);
    }
  };

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-sky-500/40 rounded-2xl p-6 shadow-2xl shadow-sky-500/20 space-y-5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-sky-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-500/20">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Human Approval Required</span>
              <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full font-semibold uppercase">
                Safe Mode
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Review and confirm the reply message before submission to X.
            </p>
          </div>
        </div>

        {/* Target Details */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">Target Author:</span>
            <span className="font-bold text-sky-400">@{request.username || "user"}</span>
          </div>

          {request.comment && (
            <div className="space-y-1 pt-1.5 border-t border-slate-900">
              <span className="text-slate-400 text-[11px] block">Comment Being Replied To:</span>
              <p className="text-slate-300 italic text-[11px] bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                &quot;{request.comment.text}&quot;
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 text-[11px]">
            <span className="text-slate-500">Post URL:</span>
            <a
              href={request.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline flex items-center gap-1 font-mono truncate max-w-[220px]"
            >
              <span>{request.postUrl}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        </div>

        {/* Message Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Outgoing Reply Message</span>
            <span className="text-[11px] text-slate-400 font-mono">{request.replyMessage.length} / 280</span>
          </div>
          <div className="p-3.5 rounded-xl bg-sky-950/30 border border-sky-500/30 text-sky-100 text-sm font-medium italic">
            &quot;{request.replyMessage}&quot;
          </div>
        </div>

        {/* Safety Gate status notice */}
        <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Safety Gate Active: &apos;Others in this conversation&apos; unchecked.</span>
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800 gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleDecision("stop")}
            className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-red-950/80 text-slate-400 hover:text-red-300 text-xs font-medium border border-slate-700/60 transition-all cursor-pointer"
          >
            <XCircle className="w-4 h-4 text-red-400" />
            <span>Stop Queue</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDecision("skip")}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer"
            >
              <SkipForward className="w-4 h-4 text-slate-400" />
              <span>Skip Item</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleDecision("submit")}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? "Submitting..." : "Confirm & Send"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
