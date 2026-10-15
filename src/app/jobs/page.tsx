"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AutomationJob, ReplyJobItem } from "../../types";
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle, Square, Play, RefreshCw, Clock, RotateCcw, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

function JobsDashboardContent() {
  const searchParams = useSearchParams();
  const activeJobId = searchParams.get("id");

  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<AutomationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchJobs = async () => {
    setIsRefreshing(true);
    try {
      let jobList: AutomationJob[] = [];
      if (typeof window !== "undefined" && window.desktop?.automation?.getAllJobs) {
        jobList = await window.desktop.automation.getAllJobs();
      } else {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        const data = await res.json();
        jobList = data.jobs || [];
      }

      setJobs(jobList);
      if (activeJobId) {
        const match = jobList.find((j: AutomationJob) => j.id === activeJobId);
        if (match) setSelectedJob(match);
      } else if (selectedJob) {
        // Keep currently selected job synchronized with fresh counts and status
        const match = jobList.find((j: AutomationJob) => j.id === selectedJob.id);
        if (match) setSelectedJob(match);
        else if (jobList.length > 0) setSelectedJob(jobList[0]);
        else setSelectedJob(null);
      } else if (jobList.length > 0) {
        setSelectedJob(jobList[0]);
      }
    } catch (err) {
      console.error("Failed to fetch jobs", err);
    } finally {
      setLoading(false);
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  useEffect(() => {
    fetchJobs();

    // Subscribe to IPC status updates if running in Electron
    let unsubscribe: (() => void) | undefined;
    if (typeof window !== "undefined" && window.desktop?.automation?.onStatusChange) {
      unsubscribe = window.desktop.automation.onStatusChange(() => {
        fetchJobs();
      });
    }

    const interval = setInterval(fetchJobs, 2000);
    return () => {
      clearInterval(interval);
      if (unsubscribe) unsubscribe();
    };
  }, [activeJobId]);

  const handleStopJob = async (jobId: string) => {
    try {
      if (typeof window !== "undefined" && window.desktop?.automation?.stopJob) {
        await window.desktop.automation.stopJob(jobId);
      } else {
        await fetch(`/api/jobs/${jobId}/stop`, { method: "POST" });
      }
      fetchJobs();
    } catch (err) {
      console.error("Failed to stop job", err);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      if (typeof window !== "undefined" && window.desktop?.automation?.retryJob) {
        await window.desktop.automation.retryJob(jobId);
      } else {
        await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
      }
      fetchJobs();
    } catch (err) {
      console.error("Failed to retry job", err);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      if (typeof window !== "undefined" && window.desktop?.automation?.deleteJob) {
        await window.desktop.automation.deleteJob(jobId);
      } else {
        await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      }
      const updatedList = jobs.filter((j) => j.id !== jobId);
      setJobs(updatedList);
      if (selectedJob?.id === jobId) {
        setSelectedJob(updatedList.length > 0 ? updatedList[0] : null);
      }
    } catch (err) {
      console.error("Failed to delete job", err);
    }
  };


  const completedCount = selectedJob
    ? selectedJob.successfulItems + selectedJob.failedItems + selectedJob.skippedItems
    : 0;
  const progressPercent = selectedJob && selectedJob.totalItems > 0
    ? Math.round((completedCount / selectedJob.totalItems) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Automation Jobs & Progress</h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time execution state, queue checklist, and job history.
          </p>
        </div>
        <button
          onClick={fetchJobs}
          disabled={isRefreshing}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-medium border border-slate-700/60 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-sky-400" : ""}`} />
          <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-slate-400">
          Loading jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center space-y-3">
          <Clock className="w-8 h-8 text-slate-500 mx-auto" />
          <h3 className="text-base font-semibold text-slate-200">No Jobs Found</h3>
          <p className="text-xs text-slate-400">Create your first automation job on the New Job page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Job List Sidebar */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Job History</h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {jobs.map((job) => {
                const isSelected = selectedJob?.id === job.id;
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`w-full p-4 rounded-xl text-left border transition-all ${
                      isSelected
                        ? "bg-slate-800 border-sky-500/80 shadow-lg shadow-sky-500/10"
                        : "bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-semibold text-sky-400 truncate max-w-[140px]">
                        {job.id}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          job.status === "running"
                            ? "bg-sky-950 text-sky-400 border border-sky-500/30 animate-pulse"
                            : job.status === "completed"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                            : job.status === "stopped"
                            ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-300 font-medium line-clamp-1 italic">
                      &quot;{job.reply}&quot;
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
                      <span>{job.totalItems} posts</span>
                      <span>{new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Job Inspector Panel */}
          {selectedJob && (
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-card rounded-2xl p-6 space-y-6 border border-slate-800">
                {/* Header & Controls */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-bold text-white font-mono">{selectedJob.id}</h3>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                          selectedJob.status === "running"
                            ? "bg-sky-950 text-sky-400 border border-sky-500/30 animate-pulse"
                            : selectedJob.status === "completed"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                            : selectedJob.status === "stopped"
                            ? "bg-amber-950 text-amber-400 border border-amber-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {selectedJob.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Mode: <span className="font-semibold text-slate-200 uppercase">{selectedJob.confirmationMode}</span>
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    {selectedJob.status === "running" && (
                      <button
                        onClick={() => handleStopJob(selectedJob.id)}
                        className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-red-600 text-white font-semibold text-xs shadow-lg shadow-red-600/20 hover:bg-red-500 transition-all cursor-pointer"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop Automation</span>
                      </button>
                    )}

                    {selectedJob.status !== "running" && (selectedJob.failedItems > 0 || selectedJob.skippedItems > 0) && (
                      <button
                        onClick={() => handleRetryJob(selectedJob.id)}
                        className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold text-xs shadow-lg shadow-amber-600/20 hover:bg-amber-500 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry Failed Items ({selectedJob.failedItems + selectedJob.skippedItems})</span>
                      </button>
                    )}

                    {selectedJob.status !== "running" && (
                      <button
                        onClick={() => handleDeleteJob(selectedJob.id)}
                        title="Delete this job from history"
                        className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-slate-700/60 hover:border-red-500/40 text-xs font-medium transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Real-time Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">Progress</span>
                    <span className="text-sky-400 font-mono">{progressPercent}% ({completedCount}/{selectedJob.totalItems})</span>
                  </div>
                  <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Counts Summary Badge Grid */}
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-center">
                    <div className="text-xl font-bold text-emerald-400 font-mono">{selectedJob.successfulItems}</div>
                    <div className="text-[11px] font-medium text-emerald-300/80">Successful</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/20 text-center">
                    <div className="text-xl font-bold text-red-400 font-mono">{selectedJob.failedItems}</div>
                    <div className="text-[11px] font-medium text-red-300/80">Failed</div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/20 text-center">
                    <div className="text-xl font-bold text-amber-400 font-mono">{selectedJob.skippedItems}</div>
                    <div className="text-[11px] font-medium text-amber-300/80">Skipped</div>
                  </div>
                </div>

                {/* Post Item List */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Queue Checklist</h4>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {selectedJob.items.map((item: ReplyJobItem, idx: number) => {
                      return (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              {item.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                              {item.status === "failed" && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                              {item.status === "skipped" && <MinusCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                              {item.status === "processing" && <RefreshCw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />}
                              {item.status === "pending" && <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />}

                              <span className="text-xs font-semibold text-slate-200">
                                #{idx + 1} @{item.username || "user"}
                              </span>
                            </div>

                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                                item.status === "success"
                                  ? "bg-emerald-950 text-emerald-400"
                                  : item.status === "failed"
                                  ? "bg-red-950 text-red-400"
                                  : item.status === "skipped"
                                  ? "bg-amber-950 text-amber-400"
                                  : item.status === "processing"
                                  ? "bg-sky-950 text-sky-400"
                                  : "bg-slate-800 text-slate-500"
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>

                          <div className="text-[11px] font-mono text-slate-400 pl-7 truncate">
                            {item.postUrl}
                          </div>

                          {item.error && (
                            <div className="pl-7 text-[11px] text-red-400 bg-red-950/20 p-2 rounded-lg border border-red-500/20 mt-1">
                              Reason: {item.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function JobsDashboardPage() {
  return (
    <Suspense fallback={<div className="glass-card rounded-2xl p-12 text-center text-slate-400">Loading jobs...</div>}>
      <JobsDashboardContent />
    </Suspense>
  );
}
