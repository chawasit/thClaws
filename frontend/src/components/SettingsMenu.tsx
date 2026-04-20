import { useEffect, useRef } from "react";
import { Globe, Folder, KeyRound } from "lucide-react";

type Choice = "global-instructions" | "folder-instructions" | "api-keys";

export function SettingsMenu({
  anchorRef,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onPick: (choice: Choice) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on click-outside (excluding the anchor so a second click on
  // the gear icon can also close the menu via its own toggle handler).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (anchorRef.current && anchorRef.current.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  const items: { id: Choice; icon: React.ReactNode; label: string; hint: string }[] = [
    {
      id: "global-instructions",
      icon: <Globe size={12} />,
      label: "Global instructions",
      hint: "Edit ~/.config/thclaws/AGENTS.md",
    },
    {
      id: "folder-instructions",
      icon: <Folder size={12} />,
      label: "Folder instructions",
      hint: "Edit AGENTS.md in the current directory",
    },
    {
      id: "api-keys",
      icon: <KeyRound size={12} />,
      label: "Provider API keys",
      hint: "Manage keys stored in the OS keychain",
    },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-2 bottom-7 rounded-md shadow-2xl py-1 z-40"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        minWidth: "220px",
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => {
            onPick(item.id);
            onClose();
          }}
          className="w-full text-left px-3 py-1.5 hover:bg-white/5 transition-colors flex items-center gap-2"
          style={{ color: "var(--text-primary)", fontSize: "12px" }}
        >
          <span style={{ color: "var(--text-secondary)" }}>{item.icon}</span>
          <div>
            <div>{item.label}</div>
            <div
              style={{ color: "var(--text-secondary)", fontSize: "10px" }}
            >
              {item.hint}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
