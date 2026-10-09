"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, CheckCircle2 } from "lucide-react";

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

interface LaunchXButtonProps {
  variant?: "header" | "card" | "large";
  className?: string;
}

export function LaunchXButton({ variant = "header", className = "" }: LaunchXButtonProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [lastLaunched, setLastLaunched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunchX = async () => {
    setIsLaunching(true);
    setError(null);
    try {
      if (typeof window !== "undefined" && window.desktop?.browser?.launchX) {
        await window.desktop.browser.launchX();
      } else if (typeof window !== "undefined" && window.desktop?.browser?.connect) {
        await window.desktop.browser.connect();
      } else {
        const res = await fetch("/api/browser/launch", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to launch browser");
        }
      }
      setLastLaunched(true);
      setTimeout(() => setLastLaunched(false), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLaunching(false);
    }
  };

  if (variant === "card") {
    return (
      <div className={`glass-card rounded-2xl p-5 border border-sky-500/30 bg-gradient-to-r from-sky-950/40 via-slate-900 to-indigo-950/40 ${className}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/25 shrink-0">
              <TwitterIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>X (Twitter) Session & Sign-In</span>
                {lastLaunched && (
                  <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 font-normal">
                    <CheckCircle2 className="w-3 h-3" /> Browser Opened
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Launch persistent Playwright browser to sign in or verify active X session.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isLaunching}
            onClick={handleLaunchX}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-sky-500/25 disabled:opacity-50 transition-all shrink-0 cursor-pointer"
          >
            {isLaunching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Launching Browser...</span>
              </>
            ) : (
              <>
                <TwitterIcon className="w-4 h-4" />
                <span>Launch & Sign in X</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </>
            )}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-2 font-medium">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        disabled={isLaunching}
        onClick={handleLaunchX}
        title="Launch Playwright browser window to sign in to X (Twitter)"
        className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-xs shadow-md shadow-sky-500/20 disabled:opacity-50 transition-all cursor-pointer border border-sky-400/20"
      >
        {isLaunching ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Launching...</span>
          </>
        ) : lastLaunched ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span>X Browser Active</span>
          </>
        ) : (
          <>
            <TwitterIcon className="w-3.5 h-3.5" />
            <span>Launch & Sign in X</span>
            <ExternalLink className="w-3 h-3 text-sky-200" />
          </>
        )}
      </button>
      {error && <span className="text-[10px] text-red-400 absolute top-full left-0 mt-1 whitespace-nowrap">{error}</span>}
    </div>
  );
}
