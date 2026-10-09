"use client";

import { useState } from "react";
import { Save, Check } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    maxPostsPerJob: 20,
    navigationTimeoutMs: 30000,
    actionTimeoutMs: 10000,
    maxRetries: 2,
    keepBrowserOpenOnFinish: false,
  });

  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">System Settings</h2>
        <p className="text-sm text-slate-400 mt-1">
          Configure safety parameters, maximum limits, and browser automation options.
        </p>
      </div>

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
            className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
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
              value={settings.navigationTimeoutMs}
              onChange={(e) =>
                setSettings({ ...settings, navigationTimeoutMs: parseInt(e.target.value) || 30000 })
              }
              className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-200">
              Action Timeout (ms)
            </label>
            <input
              type="number"
              step={1000}
              value={settings.actionTimeoutMs}
              onChange={(e) =>
                setSettings({ ...settings, actionTimeoutMs: parseInt(e.target.value) || 10000 })
              }
              className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            />
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
            className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          />
          <p className="text-xs text-slate-400">Limits automatic retries for transient navigation delays.</p>
        </div>

        <div className="flex items-center space-x-3 pt-4 border-t border-slate-800">
          <input
            type="checkbox"
            id="keepBrowser"
            checked={settings.keepBrowserOpenOnFinish}
            onChange={(e) =>
              setSettings({ ...settings, keepBrowserOpenOnFinish: e.target.checked })
            }
            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500/50"
          />
          <label htmlFor="keepBrowser" className="text-sm font-medium text-slate-300">
            Keep browser window open after job finishes
          </label>
        </div>

        <div className="pt-4 flex items-center justify-end space-x-3">
          {saved && (
            <span className="text-xs text-emerald-400 font-medium flex items-center space-x-1">
              <Check className="w-3.5 h-3.5" />
              <span>Settings saved!</span>
            </span>
          )}
          <button
            type="submit"
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-sky-500 text-white font-semibold text-sm shadow-lg shadow-sky-500/25 hover:bg-sky-400 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
}
