"use client";

import { useState, useEffect } from "react";
import { Save, Check, FolderOpen, AlertCircle, RefreshCw } from "lucide-react";
import { AutomationSettings } from "@/types";
import { AppPaths } from "@/types/electron";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AutomationSettings>({
    maxPostsPerJob: 20,
    confirmationMode: "per-post",
    navigationTimeoutMs: 30000,
    actionTimeoutMs: 10000,
    maxRetries: 2,
    keepBrowserOpenOnFinish: false,
  });

  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing settings on mount
  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        if (typeof window !== "undefined" && window.desktop?.settings?.getSettings) {
          const loaded = await window.desktop.settings.getSettings();
          setSettings(loaded);
          if (window.desktop.settings.getPaths) {
            const p = await window.desktop.settings.getPaths();
            setPaths(p);
          }
        } else {
          const res = await fetch("/api/settings");
          const data = await res.json();
          if (data.settings) setSettings(data.settings);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (typeof window !== "undefined" && window.desktop?.settings?.updateSettings) {
        const updated = await window.desktop.settings.updateSettings(settings);
        setSettings(updated);
      } else {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to save settings");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFolder = async (target: "logs" | "screenshots" | "browserProfile" | "userData") => {
    try {
      if (typeof window !== "undefined" && window.desktop?.settings?.openFolder) {
        await window.desktop.settings.openFolder(target);
      }
    } catch (err) {
      console.error(`Failed to open ${target} folder:`, err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto glass-card rounded-2xl p-12 text-center text-slate-400 space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-400" />
        <p className="text-xs">Loading configuration settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">System Settings</h2>
        <p className="text-sm text-slate-400 mt-1">
          Configure safety parameters, maximum limits, timeouts, and local storage options.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/30 text-red-300 text-sm flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="glass-card rounded-2xl p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-200">
            Maximum Posts Per Job
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={settings.maxPostsPerJob}
            onChange={(e) =>
              setSettings({ ...settings, maxPostsPerJob: parseInt(e.target.value) || 20 })
            }
            className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-mono"
          />
          <p className="text-xs text-slate-400">Conservative limit per batch execution (default: 20).</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-200">
              Navigation Timeout (ms)
            </label>
            <input
              type="number"
              step={1000}
              min={5000}
              max={120000}
              value={settings.navigationTimeoutMs}
              onChange={(e) =>
                setSettings({ ...settings, navigationTimeoutMs: parseInt(e.target.value) || 30000 })
              }
              className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-mono"
            />
            <p className="text-[11px] text-slate-400">Timeout for loading post pages (default: 30000).</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-200">
              Action Timeout (ms)
            </label>
            <input
              type="number"
              step={1000}
              min={2000}
              max={60000}
              value={settings.actionTimeoutMs}
              onChange={(e) =>
                setSettings({ ...settings, actionTimeoutMs: parseInt(e.target.value) || 10000 })
              }
              className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-mono"
            />
            <p className="text-[11px] text-slate-400">Timeout for finding UI selectors (default: 10000).</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-200">
            Maximum Retries per Post
          </label>
          <input
            type="number"
            min={0}
            max={5}
            value={settings.maxRetries}
            onChange={(e) =>
              setSettings({ ...settings, maxRetries: parseInt(e.target.value) || 2 })
            }
            className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-mono"
          />
          <p className="text-xs text-slate-400">Limits automatic retries for transient navigation or selector delays.</p>
        </div>

        <div className="flex items-center space-x-3 pt-4 border-t border-slate-800">
          <input
            type="checkbox"
            id="keepBrowser"
            checked={settings.keepBrowserOpenOnFinish || false}
            onChange={(e) =>
              setSettings({ ...settings, keepBrowserOpenOnFinish: e.target.checked })
            }
            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500/50 cursor-pointer"
          />
          <label htmlFor="keepBrowser" className="text-sm font-medium text-slate-300 cursor-pointer">
            Keep browser window open after job finishes
          </label>
        </div>

        <div className="pt-4 flex items-center justify-end space-x-3">
          {saved && (
            <span className="text-xs text-emerald-400 font-medium flex items-center space-x-1">
              <Check className="w-3.5 h-3.5" />
              <span>Settings saved to disk!</span>
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-sky-500 text-white font-semibold text-sm shadow-lg shadow-sky-500/25 hover:bg-sky-400 disabled:opacity-50 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Saving..." : "Save Settings"}</span>
          </button>
        </div>
      </form>

      {/* Diagnostics & Local Folders */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-indigo-400" />
          <span>Local Storage & Diagnostics Folders</span>
        </h3>
        <p className="text-xs text-slate-400">
          Access your persistent browser session, runtime error logs, and debug screenshots directly in file explorer.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleOpenFolder("logs")}
            className="flex items-center justify-center space-x-2 p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 hover:text-white transition-all cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-sky-400" />
            <span>Open Logs</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenFolder("screenshots")}
            className="flex items-center justify-center space-x-2 p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 hover:text-white transition-all cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-indigo-400" />
            <span>Open Screenshots</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenFolder("browserProfile")}
            className="flex items-center justify-center space-x-2 p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-xs text-slate-200 hover:text-white transition-all cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-emerald-400" />
            <span>Open Profile</span>
          </button>
        </div>

        {paths && (
          <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 break-all space-y-1">
            <div><span className="text-slate-400">UserData:</span> {paths.userData}</div>
            <div><span className="text-slate-400">Logs:</span> {paths.logs}</div>
          </div>
        )}
      </div>
    </div>
  );
}
