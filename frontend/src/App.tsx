import { useEffect, useRef, useState } from "react";
import { Terminal, MessageSquare, FolderTree, Users, FolderOpen, Folder, Settings } from "lucide-react";
import { TerminalView } from "./components/TerminalView";
import { ChatView } from "./components/ChatView";
import { FilesView } from "./components/FilesView";
import { TeamView } from "./components/TeamView";
import { Sidebar } from "./components/Sidebar";
import { SettingsModal } from "./components/SettingsModal";
import { SettingsMenu } from "./components/SettingsMenu";
import { InstructionsEditorModal } from "./components/InstructionsEditorModal";
import { SecretsBackendDialog } from "./components/SecretsBackendDialog";
import { useEditingShortcuts } from "./hooks/useEditingShortcuts";
import { send, subscribe } from "./hooks/useIPC";

type Tab = "terminal" | "chat" | "files" | "team";

const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "terminal", label: "Terminal", icon: <Terminal size={14} /> },
  { id: "chat", label: "Chat", icon: <MessageSquare size={14} /> },
  { id: "files", label: "Files", icon: <FolderTree size={14} /> },
  { id: "team", label: "Team", icon: <Users size={14} /> },
];

// ── Startup modal ────────────────────────────────────────────────────
// Shown before anything else. User confirms (or changes) the working
// directory; on "Start" the backend sets cwd + re-inits sandbox, and
// only then does the PTY spawn and the tabs become active.

function StartupModal({ onStart }: { onStart: (cwd: string) => void }) {
  const [cwd, setCwd] = useState("");
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState<boolean | null>(null);
  const [picking, setPicking] = useState(false);
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let gotResponse = false;
    const unsub = subscribe((msg) => {
      if (msg.type === "current_cwd" && typeof msg.path === "string") {
        gotResponse = true;
        setCwd(msg.path as string);
        if (Array.isArray(msg.recent_dirs)) {
          setRecentDirs(msg.recent_dirs as string[]);
        }
        if (msg.needs_modal === false) {
          onStart(msg.path as string);
        } else {
          setShowModal(true);
        }
      } else if (msg.type === "directory_picked") {
        setPicking(false);
        if (typeof msg.path === "string") {
          setCwd(msg.path as string);
          setError("");
        }
      } else if (msg.type === "cwd_changed") {
        if (msg.ok) {
          onStart(msg.path as string);
        } else {
          setError(msg.error as string);
        }
      }
    });
    // Retry get_cwd on a short interval: window.ipc may not be injected
    // yet on the very first useEffect tick (wry injects it after the page
    // loads, but React's first effect can fire before that). Polling at
    // 100ms is invisible to the user and stops the moment we hear back.
    send({ type: "get_cwd" });
    const retry = setInterval(() => {
      if (!gotResponse) send({ type: "get_cwd" });
      else clearInterval(retry);
    }, 100);
    return () => { unsub(); clearInterval(retry); };
  }, [onStart]);

  // Focus the input whenever cwd changes and the modal is visible.
  // Must be declared before any conditional return (React Rules of Hooks).
  useEffect(() => {
    if (showModal) inputRef.current?.focus();
  }, [cwd, showModal]);

  // Still waiting for backend reply — show nothing.
  if (showModal === null) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.85)" }}
      />
    );
  }

  const handleStart = () => {
    setError("");
    if (!cwd.trim()) return;
    send({ type: "set_cwd", path: cwd.trim() });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(0,0,0,0.85)" }}
    >
      <div
        className="rounded-lg shadow-2xl p-6 max-w-lg w-full mx-4"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen size={20} style={{ color: "var(--accent)" }} />
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Working Directory
          </h2>
        </div>
        <p
          className="text-xs mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          thClaws will operate inside this directory. All file tools are
          sandboxed to it. Change it now if needed.
        </p>
        <div className="flex gap-1.5 mb-1">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 px-3 py-2 rounded text-xs font-mono outline-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            value={cwd}
            onChange={(e) => { setCwd(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleStart(); }}
          />
          <button
            className="px-3 py-2 rounded text-xs font-medium shrink-0"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
            onClick={() => { setPicking(true); send({ type: "pick_directory", start: cwd }); }}
            disabled={picking}
            title="Browse for directory"
          >
            {picking ? "…" : "Browse"}
          </button>
        </div>
        {error && (
          <p className="text-xs mb-2" style={{ color: "var(--danger, #e06c75)" }}>
            {error}
          </p>
        )}
        {recentDirs.filter((d) => d !== cwd).length > 0 && (
          <div className="mt-3 mb-1">
            <p
              className="text-[10px] mb-1.5 uppercase tracking-wider"
              style={{ color: "var(--text-secondary)" }}
            >
              Recent
            </p>
            <div className="flex flex-col gap-1">
              {recentDirs.filter((d) => d !== cwd).map((dir) => (
                <button
                  key={dir}
                  className="text-left px-2.5 py-1.5 rounded text-xs font-mono truncate hover:brightness-125 transition-colors"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                  onClick={() => { setCwd(dir); setError(""); }}
                  title={dir}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button
            className="px-4 py-1.5 rounded text-xs font-medium"
            style={{
              background: "var(--accent)",
              color: "#fff",
            }}
            onClick={handleStart}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main app ─────────────────────────────────────────────────────────

export default function App() {
  // Wire up Cmd+C / Cmd+X / Cmd+V / Cmd+A / Cmd+Z for every <input>
  // and <textarea> in the app. Wry doesn't forward the macOS edit-menu
  // shortcuts by default; without this the user has to right-click
  // to paste.
  useEditingShortcuts();

  const [started, setStarted] = useState(false);
  const [currentCwd, setCurrentCwd] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("terminal");
  const [hasTeam, setHasTeam] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [instructionsScope, setInstructionsScope] =
    useState<"global" | "folder" | null>(null);
  // Secrets-backend gate: we ask once at first launch so the app
  // never touches the OS keychain behind the user's back. `null` ==
  // not picked yet → show the chooser before the main UI.
  const [secretsBackend, setSecretsBackend] =
    useState<"keychain" | "dotenv" | null>(null);
  const [secretsBackendChecked, setSecretsBackendChecked] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);

  // Ask the backend for the stored choice as soon as the app mounts.
  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === "secrets_backend") {
        const value = (msg.backend as string | null) ?? null;
        setSecretsBackend(
          value === "keychain" || value === "dotenv" ? value : null,
        );
        setSecretsBackendChecked(true);
      }
    });
    send({ type: "secrets_backend_get" });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === "team_status" && typeof msg.has_team === "boolean") {
        setHasTeam(msg.has_team);
      }
    });
    send({ type: "team_list" });
    const interval = setInterval(() => send({ type: "team_list" }), 3000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  // If the team disappears (e.g. user deleted .thclaws/team/) while the Team
  // tab is active, fall back to Terminal instead of leaving a dangling tab.
  useEffect(() => {
    if (!hasTeam && activeTab === "team") setActiveTab("terminal");
  }, [hasTeam, activeTab]);

  const TABS = hasTeam ? ALL_TABS : ALL_TABS.filter((t) => t.id !== "team");

  if (!started) {
    return <StartupModal onStart={(cwd) => { setCurrentCwd(cwd); setStarted(true); }} />;
  }

  // First launch only — after the user has picked a working directory
  // but before the main tabs mount, make them pick where API keys go.
  // This is the whole reason the app doesn't touch the keychain at
  // startup: no choice, no prompt.
  if (secretsBackendChecked && secretsBackend === null) {
    return (
      <SecretsBackendDialog
        onPicked={(choice) => setSecretsBackend(choice)}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Tab bar */}
      <div
        className="flex items-center gap-0 border-b select-none shrink-0"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors"
            style={{
              color:
                activeTab === tab.id
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              background:
                activeTab === tab.id ? "var(--bg-primary)" : "transparent",
              borderBottom:
                activeTab === tab.id
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <span
          className="text-[10px] px-3"
          style={{ color: "var(--text-secondary)" }}
        >
          thClaws
        </span>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 min-w-0 relative">
          {/* Keep every tab panel mounted AND full-sized via absolute+inset-0.
              Inactive panels get `invisible` + `pointer-events-none` so they
              don't receive input but keep their layout. This avoids
              `display: none` — which zeroes xterm's grid and kills focus,
              making the terminal un-typeable after a tab switch. */}
          {TABS.map(({ id }) => {
            const isActive = activeTab === id;
            const cls = `absolute inset-0 ${isActive ? "" : "invisible pointer-events-none"}`;
            return (
              <div key={id} className={cls}>
                {id === "terminal" && <TerminalView active={isActive} />}
                {id === "chat" && <ChatView />}
                {id === "files" && <FilesView active={isActive} />}
                {id === "team" && <TeamView />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0 select-none border-t"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
          color: "var(--text-secondary)",
          fontSize: "12px",
          lineHeight: "16px",
        }}
      >
        <button
          onClick={() => {
            // Kill the current PTY so a fresh one spawns in the new dir.
            send({ type: "pty_kill" });
            setStarted(false);
            setCurrentCwd("");
          }}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Change working directory"
          style={{ flexShrink: 0 }}
        >
          <Folder size={14} style={{ opacity: 0.7 }} />
        </button>
        <span className="truncate font-mono" title={currentCwd}>
          {currentCwd}
        </span>
        <div className="flex-1" />
        <div className="relative" style={{ flexShrink: 0 }}>
          <button
            ref={settingsButtonRef}
            onClick={() => setShowSettingsMenu((v) => !v)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Settings"
          >
            <Settings size={14} style={{ opacity: 0.7 }} />
          </button>
          {showSettingsMenu && (
            <SettingsMenu
              anchorRef={settingsButtonRef}
              onClose={() => setShowSettingsMenu(false)}
              onPick={(choice) => {
                if (choice === "api-keys") setShowSettings(true);
                else if (choice === "global-instructions") setInstructionsScope("global");
                else if (choice === "folder-instructions") setInstructionsScope("folder");
              }}
            />
          )}
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {instructionsScope && (
        <InstructionsEditorModal
          scope={instructionsScope}
          onClose={() => setInstructionsScope(null)}
        />
      )}
    </div>
  );
}
