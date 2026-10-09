import "./globals.css";
import Link from "next/link";
import { LaunchXButton } from "@/components/browser/launch-x-button";
import { NetworkStatusBadge } from "@/components/common/network-status-badge";
import { ListTodo, MessageSquareText, Settings } from "lucide-react";

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export const metadata = {
  title: "X Engagement Assistant",
  description: "Local Educational X Reply Automation Assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <TwitterIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex items-center space-x-3">
                <div>
                  <h1 className="font-bold text-lg leading-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                    X Engagement Assistant
                  </h1>
                  <p className="text-xs text-slate-400">Local Automation Control Panel</p>
                </div>
                <NetworkStatusBadge />
              </div>
            </div>

            <nav className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <Link
                  href="/"
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
                >
                  <MessageSquareText className="w-4 h-4 text-sky-400" />
                  <span>New Job</span>
                </Link>
                <Link
                  href="/jobs"
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
                >
                  <ListTodo className="w-4 h-4 text-indigo-400" />
                  <span>Jobs & Progress</span>
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
                >
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span>Settings</span>
                </Link>
              </div>

              <div className="pl-3 border-l border-slate-800">
                <LaunchXButton variant="header" />
              </div>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
          {children}
        </main>

        <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
          X Engagement Assistant — Local Educational Automation Project
        </footer>
      </body>
    </html>
  );
}
