"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateAndParseXPostUrl } from "../utils/url";
import { ConfirmationMode, XComment } from "../types";
import {
  Send,
  Eye,
  AlertCircle,
  ArrowLeft,
  ShieldAlert,
  Zap,
  Search,
  MessageSquare,
  Sparkles,
  RefreshCw,
  CheckSquare,
  Square,
} from "lucide-react";
import { CommentCard } from "@/components/comments/comment-card";
import { LaunchXButton } from "@/components/browser/launch-x-button";

export default function NewJobPage() {
  const router = useRouter();

  // Workflow Mode: "comments" (Find & Reply to Comments) vs "posts" (Direct Reply to Posts)
  const [workflowMode, setWorkflowMode] = useState<"comments" | "posts">("comments");

  // Post Reply Form State
  const [rawUrls, setRawUrls] = useState("");
  const [replyText, setReplyText] = useState("");
  const [confirmationMode, setConfirmationMode] = useState<ConfirmationMode>("batch");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comment Discovery State (Phase 1, 2, 3, 4, 5)
  const [commentPostUrl, setCommentPostUrl] = useState("");
  const [discoveryLimit, setDiscoveryLimit] = useState(300);
  const [commentReplyText, setCommentReplyText] = useState("");
  const [excludedUsernamesInput, setExcludedUsernamesInput] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredComments, setDiscoveredComments] = useState<XComment[]>([]);
  const [parentPostId, setParentPostId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "selected" | "unselected">("all");
  const [isCommentPreviewOpen, setIsCommentPreviewOpen] = useState(false);

  // Parse URLs live for Post Mode
  const parsedUrlList = rawUrls
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
    .map((u) => ({
      raw: u,
      parsed: validateAndParseXPostUrl(u),
    }));

  const validPosts = parsedUrlList.filter((item) => item.parsed.valid);
  const invalidCount = parsedUrlList.length - validPosts.length;

  const replyLength = replyText.trim().length;
  const isReplyValid = replyLength > 0 && replyLength <= 280;
  const isFormValid = validPosts.length > 0 && isReplyValid;

  // Selected comments array
  const selectedComments = discoveredComments.filter((c) => c.isSelected);
  const isCommentReplyFormValid =
    selectedComments.length > 0 &&
    commentReplyText.trim().length > 0 &&
    commentReplyText.trim().length <= 280;

  const parsedExcludedUsernames = excludedUsernamesInput
    .split(/[\n,]/)
    .map((u) => u.trim().replace(/^@/, ""))
    .filter(Boolean);

  // Comment Discovery Handler
  const handleDiscoverComments = async () => {
    const parsed = validateAndParseXPostUrl(commentPostUrl);
    if (!parsed.valid || !parsed.normalizedUrl) {
      setError("Please provide a valid X post URL (e.g. https://x.com/user/status/123456)");
      return;
    }

    setIsDiscovering(true);
    setError(null);
    setDiscoveredComments([]);
    setParentPostId(null);

    try {
      const maxToDiscover = Math.min(500, Math.max(1, discoveryLimit || 300));
      const calculatedScrolls = Math.min(200, Math.max(20, Math.ceil(maxToDiscover / 2)));
      let data;
      if (typeof window !== "undefined" && window.desktop?.automation?.discoverComments) {
        data = await window.desktop.automation.discoverComments({
          postUrl: parsed.normalizedUrl,
          maxComments: maxToDiscover,
          maxScrolls: calculatedScrolls,
          excludedUsernames: parsedExcludedUsernames,
        });
      } else {
        const res = await fetch("/api/comments/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postUrl: parsed.normalizedUrl,
            maxComments: maxToDiscover,
            maxScrolls: calculatedScrolls,
            excludedUsernames: parsedExcludedUsernames,
          }),
        });

        data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to discover comments");
        }
      }

      setDiscoveredComments(data.comments || []);
      setParentPostId(data.postId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsDiscovering(false);
    }
  };

  // Selection state helpers
  const toggleSelectComment = (commentId: string) => {
    setDiscoveredComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, isSelected: !c.isSelected } : c))
    );
  };

  const selectAllComments = () => {
    setDiscoveredComments((prev) => prev.map((c) => ({ ...c, isSelected: true })));
  };

  const clearAllComments = () => {
    setDiscoveredComments((prev) => prev.map((c) => ({ ...c, isSelected: false })));
  };

  // Filter discovered comments
  const filteredComments = discoveredComments.filter((c) => {
    const matchesSearch =
      c.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.authorUsername.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.authorDisplayName && c.authorDisplayName.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterTab === "selected") return c.isSelected;
    if (filterTab === "unselected") return !c.isSelected;
    return true;
  });

  const selectedCount = selectedComments.length;

  // Start Comment Reply Automation
  const handleStartCommentReplyAutomation = async () => {
    if (!isCommentReplyFormValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const parsed = validateAndParseXPostUrl(commentPostUrl);
      let jobId: string;

      if (typeof window !== "undefined" && window.desktop?.automation?.createReplyJob) {
        const res = await window.desktop.automation.createReplyJob({
          urls: selectedComments.map((c) =>
            c.url.startsWith("http") ? c.url : `https://x.com${c.url.startsWith("/") ? "" : "/"}${c.url}`
          ),
          comments: selectedComments,
          reply: commentReplyText.trim(),
          confirmationMode: confirmationMode === "per-post" ? "per-post" : "batch",
          type: "comment_reply",
          excludedUsernames: parsedExcludedUsernames,
        });
        jobId = res.jobId;
      } else {
        const res = await fetch("/api/comments/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postUrl: parsed.normalizedUrl || commentPostUrl,
            comments: selectedComments,
            reply: commentReplyText.trim(),
            confirmationMode: confirmationMode === "per-post" ? "per-comment" : "batch",
            excludedUsernames: parsedExcludedUsernames,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to create comment reply job");
        }
        jobId = data.jobId;
      }

      router.push(`/jobs?id=${jobId}`);
    } catch (err) {
      setError((err as Error).message);
      setIsSubmitting(false);
    }
  };

  // Start Post Reply Automation
  const handleStartAutomation = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      let jobId: string;
      if (typeof window !== "undefined" && window.desktop?.automation?.createReplyJob) {
        const res = await window.desktop.automation.createReplyJob({
          urls: validPosts.map((p) => p.parsed.normalizedUrl!),
          reply: replyText.trim(),
          confirmationMode,
          type: "post_reply",
          excludedUsernames: parsedExcludedUsernames,
        });
        jobId = res.jobId;
      } else {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            urls: validPosts.map((p) => p.parsed.normalizedUrl!),
            reply: replyText.trim(),
            confirmationMode,
            excludedUsernames: parsedExcludedUsernames,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to create job");
        }
        jobId = data.jobId;
        await fetch(`/api/jobs/${data.jobId}/start`, { method: "POST" });
      }

      router.push(`/jobs?id=${jobId}`);
    } catch (err) {
      setError((err as Error).message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">X Engagement Assistant</h2>
        <p className="text-sm text-slate-400 mt-1">
          Automate educational engagement under X posts and comment threads.
        </p>
      </div>

      <LaunchXButton variant="card" />

      {/* Workflow Mode Tabs */}
      <div className="grid grid-cols-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
        <button
          type="button"
          onClick={() => {
            setWorkflowMode("comments");
            setError(null);
          }}
          className={`flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium text-xs transition-all ${
            workflowMode === "comments"
              ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Find & Reply to Comments</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setWorkflowMode("posts");
            setError(null);
          }}
          className={`flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium text-xs transition-all ${
            workflowMode === "posts"
              ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Reply to Main Post</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/30 text-red-300 text-sm flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* WORKFLOW MODE 1: FIND & REPLY TO COMMENTS */}
      {workflowMode === "comments" && (
        <div className="space-y-6">
          {!isCommentPreviewOpen ? (
            <>
              {/* Discovery Input Form */}
              <div className="glass-card rounded-2xl p-6 space-y-4">
                <label className="text-sm font-semibold text-slate-200 block">
                  Target X Post URL for Comment Discovery
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={commentPostUrl}
                    onChange={(e) => setCommentPostUrl(e.target.value)}
                    placeholder="https://x.com/username/status/123456789"
                    className="flex-1 bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 font-mono"
                  />
                  <div className="relative shrink-0">
                    <input
                      type="number"
                      min={10}
                      max={500}
                      step={10}
                      value={discoveryLimit}
                      onChange={(e) => setDiscoveryLimit(Math.min(500, Math.max(1, parseInt(e.target.value) || 300)))}
                      title="Max comments to discover (up to 500, default: 300)"
                      className="w-24 bg-slate-900/80 border border-slate-700/60 rounded-xl px-3 py-3 text-sm text-center text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-mono"
                    />
                    <span className="absolute -top-2 left-2 bg-slate-800 text-[9px] uppercase font-bold px-1 rounded text-slate-400">
                      Limit
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isDiscovering || !commentPostUrl.trim()}
                    onClick={handleDiscoverComments}
                    className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                  >
                    {isDiscovering ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Discovering...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Find Comments</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-1.5 pt-3 border-t border-slate-800/80">
                  <label className="text-xs font-semibold text-slate-300 block">
                    Excluded / Blacklisted Usernames <span className="text-slate-500 font-normal">(Never reply to & mandatorily uncheck, e.g. @user1, @user2)</span>
                  </label>
                  <input
                    type="text"
                    value={excludedUsernamesInput}
                    onChange={(e) => setExcludedUsernamesInput(e.target.value)}
                    placeholder="@baduser1, @baduser2"
                    className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 font-mono"
                  />
                </div>
              </div>

              {/* Discovery Loading State */}
              {isDiscovering && (
                <div className="glass-card rounded-2xl p-8 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
                  <h3 className="text-base font-semibold text-white">Discovering Replies under Post...</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Opening Playwright Chromium browser, navigating to post, scrolling dynamically, and extracting comments...
                  </p>
                </div>
              )}

              {/* Discovered Comments Panel & Reply Composer */}
              {!isDiscovering && discoveredComments.length > 0 && (
                <div className="glass-card rounded-2xl p-6 space-y-6 border border-slate-800">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-wrap gap-4">
                    <div>
                      <h3 className="text-base font-bold text-white">Discovered Comments</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Found {discoveredComments.length} comment{discoveredComments.length === 1 ? "" : "s"} under post #{parentPostId}.
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="text-xs font-semibold text-sky-400 bg-sky-950/60 px-3 py-1.5 rounded-lg border border-sky-500/30">
                        Selected: {selectedCount} / {discoveredComments.length}
                      </span>
                      <button
                        type="button"
                        onClick={selectAllComments}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white text-xs font-medium border border-slate-700/60"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
                        <span>Select All</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearAllComments}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white text-xs font-medium border border-slate-700/60"
                      >
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                        <span>Clear</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by username or comment text..."
                        className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setFilterTab("all")}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          filterTab === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        All ({discoveredComments.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterTab("selected")}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          filterTab === "selected" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Selected ({selectedCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterTab("unselected")}
                        className={`px-3 py-1 rounded-lg font-medium transition-all ${
                          filterTab === "unselected" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Unselected ({discoveredComments.length - selectedCount})
                      </button>
                    </div>
                  </div>

                  {/* Comment List */}
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {filteredComments.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-xs">
                        No comments match your search filter.
                      </div>
                    ) : (
                      filteredComments.map((comment) => (
                        <CommentCard
                          key={comment.id}
                          comment={comment}
                          onToggleSelect={toggleSelectComment}
                        />
                      ))
                    )}
                  </div>

                  {/* Reply Message Input for Selected Comments */}
                  <div className="pt-4 border-t border-slate-800 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-200">
                          Reply Message for Selected Comments ({selectedCount})
                        </label>
                        <span
                          className={`text-xs font-mono font-medium ${
                            commentReplyText.length > 280
                              ? "text-red-400"
                              : commentReplyText.length > 240
                              ? "text-amber-400"
                              : "text-slate-400"
                          }`}
                        >
                          {commentReplyText.length} / 280
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        value={commentReplyText}
                        onChange={(e) => setCommentReplyText(e.target.value)}
                        placeholder="Enter the message you want to send as a reply to each selected commenter..."
                        className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all"
                      />
                    </div>

                    {/* Confirmation Mode Selection */}
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <button
                        type="button"
                        onClick={() => setConfirmationMode("per-post")}
                        className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          confirmationMode === "per-post"
                            ? "bg-sky-950/40 border-sky-500 text-sky-200 shadow-lg shadow-sky-500/10"
                            : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <ShieldAlert className="w-4 h-4 text-sky-400" />
                          <span className="text-[10px] uppercase font-bold text-sky-400">Safe Mode</span>
                        </div>
                        <div className="font-semibold text-xs text-white">Per-Comment Prompt</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Prompt before submitting each comment reply.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmationMode("batch")}
                        className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          confirmationMode === "batch"
                            ? "bg-indigo-950/40 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/10"
                            : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <Zap className="w-4 h-4 text-indigo-400" />
                          <span className="text-[10px] uppercase font-bold text-indigo-400">Default</span>
                        </div>
                        <div className="font-semibold text-xs text-white">Batch Mode</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Approve selected comment queue once and execute.
                        </div>
                      </button>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        disabled={!isCommentReplyFormValid}
                        onClick={() => setIsCommentPreviewOpen(true)}
                        className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Preview Comment Replies ({selectedCount})</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* COMMENT REPLIES PREVIEW MODAL (Section 16) */
            <div className="glass-card rounded-2xl p-6 space-y-6 border border-sky-500/30">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-white">Review Comment Replies</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ready to reply to <span className="font-bold text-sky-400">{selectedCount}</span> selected comment{selectedCount === 1 ? "" : "s"} in{" "}
                    <span className="font-semibold text-sky-400 uppercase">{confirmationMode}</span> mode.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCommentPreviewOpen(false)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Selection</span>
                </button>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Reply Message</h4>
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm italic font-medium">
                  &quot;{commentReplyText.trim()}&quot;
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Selected Target Comments ({selectedCount})
                </h4>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {selectedComments.map((comment, idx) => (
                    <div
                      key={comment.id}
                      className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="font-semibold text-sky-300">
                            @{comment.authorUsername}
                          </span>
                          {comment.authorDisplayName && (
                            <span className="text-slate-400 font-medium">
                              ({comment.authorDisplayName})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-[11px] italic">
                        &quot;{comment.text}&quot;
                      </div>

                      <div className="text-emerald-400 text-[11px] font-medium pt-1 flex items-center space-x-1.5">
                        <Send className="w-3 h-3" />
                        <span>Target Verified: Replying directly to @{comment.authorUsername}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsCommentPreviewOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleStartCommentReplyAutomation}
                  className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 disabled:opacity-50 transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? "Starting Job..." : "Confirm & Start Comment Replies"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WORKFLOW MODE 2: DIRECT POST REPLY (Preserved existing functionality) */}
      {workflowMode === "posts" && (
        <>
          {!isPreviewOpen ? (
            <div className="glass-card rounded-2xl p-6 space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-200">
                    X Post URLs <span className="text-slate-500 font-normal">(One per line or comma-separated)</span>
                  </label>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      validPosts.length > 0
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {validPosts.length} valid post{validPosts.length === 1 ? "" : "s"}
                    {invalidCount > 0 && ` (${invalidCount} invalid)`}
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={rawUrls}
                  onChange={(e) => setRawUrls(e.target.value)}
                  placeholder="https://x.com/username/status/1234567890&#10;https://x.com/another_user/status/9876543210"
                  className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all font-mono"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-200">Reply Message</label>
                  <span
                    className={`text-xs font-mono font-medium ${
                      replyLength > 280
                        ? "text-red-400"
                        : replyLength > 240
                        ? "text-amber-400"
                        : "text-slate-400"
                    }`}
                  >
                    {replyLength} / 280
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Your reply message goes here..."
                  className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all"
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-800">
                <label className="text-sm font-semibold text-slate-200">Confirmation Mode</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setConfirmationMode("per-post")}
                    className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      confirmationMode === "per-post"
                        ? "bg-sky-950/40 border-sky-500 text-sky-200 shadow-lg shadow-sky-500/10"
                        : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <ShieldAlert className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="font-semibold text-sm text-white">Safe Mode (Per-Post)</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Pauses before submitting each post to ask for explicit confirmation.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmationMode("batch")}
                    className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      confirmationMode === "batch"
                        ? "bg-indigo-950/40 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <Zap className="w-5 h-5 text-indigo-400" />
                      <span className="text-xs uppercase tracking-wider font-bold text-indigo-400">Default</span>
                    </div>
                    <div className="font-semibold text-sm text-white">Batch Mode</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Approve the entire queue once. Runs automatically with progress updates.
                    </div>
                  </button>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!isFormValid}
                  onClick={() => setIsPreviewOpen(true)}
                  className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-sm shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview Automation</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-6 space-y-6 border border-sky-500/30">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-white">Review Automation Job</h3>
                  <p className="text-xs text-slate-400">
                    {validPosts.length} post{validPosts.length === 1 ? "" : "s"} ready to process in{" "}
                    <span className="font-semibold text-sky-400 uppercase">{confirmationMode}</span> mode.
                  </p>
                </div>
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Edit Input</span>
                </button>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Reply Message</h4>
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm italic font-medium">
                  &quot;{replyText.trim()}&quot;
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selected Target Posts</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {validPosts.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-[10px]">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-sky-300">
                          @{item.parsed.username || "user"}
                        </span>
                      </div>
                      <span className="font-mono text-slate-400 text-[11px] truncate max-w-xs">
                        {item.parsed.normalizedUrl}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleStartAutomation}
                  className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 disabled:opacity-50 transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? "Starting Job..." : "Start Automation"}</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
