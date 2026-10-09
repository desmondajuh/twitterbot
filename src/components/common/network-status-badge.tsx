"use client";

import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function NetworkStatusBadge() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic heartbeat check
    const interval = setInterval(() => {
      if (navigator.onLine !== isOnline) {
        setIsOnline(navigator.onLine);
      }
    }, 4000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [isOnline]);

  if (!isOnline) {
    return (
      <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-red-950/80 border border-red-500/40 text-red-300 text-xs font-semibold animate-pulse shadow-lg shadow-red-950/50">
        <WifiOff className="w-3.5 h-3.5 text-red-400" />
        <span>No Internet Connection</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400 text-[11px] font-medium">
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <Wifi className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600 animate-pulse" />
      <span>Online</span>
    </div>
  );
}
