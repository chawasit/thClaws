import { useState } from "react";
import { Lock, FileText, X } from "lucide-react";
import { send, subscribe } from "../hooks/useIPC";

type Backend = "keychain" | "dotenv";

export function SecretsBackendDialog({
  onPicked,
  onCancel,
}: {
  onPicked: (backend: Backend) => void;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState<Backend | null>(null);

  const choose = (backend: Backend) => {
    setBusy(backend);
    const unsub = subscribe((msg) => {
      if (msg.type === "secrets_backend_result" && msg.backend === backend) {
        unsub();
        setBusy(null);
        if (msg.ok) onPicked(backend);
      }
    });
    send({ type: "secrets_backend_set", backend });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-lg shadow-2xl p-6 max-w-lg w-full mx-4"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Where should thClaws store API keys?
          </h2>
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1 rounded hover:bg-white/10"
              style={{ color: "var(--text-secondary)" }}
              title="Cancel"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <p
          className="text-xs mb-4"
          style={{ color: "var(--text-secondary)" }}
        >
          Pick once. You can change this later by editing{" "}
          <span className="font-mono">~/.config/thclaws/secrets.json</span>.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => choose("keychain")}
            disabled={busy !== null}
            className="text-left p-3 rounded transition-colors hover:brightness-125 disabled:opacity-50"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--accent)",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Lock size={14} style={{ color: "var(--accent)" }} />
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                OS keychain (recommended)
              </span>
            </div>
            <div
              className="text-[11px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              Encrypted at rest, tied to your user account. macOS Keychain,
              Windows Credential Manager, or Linux Secret Service. You'll
              see a one-time access prompt the first time thClaws reads a
              key.
            </div>
          </button>

          <button
            onClick={() => choose("dotenv")}
            disabled={busy !== null}
            className="text-left p-3 rounded transition-colors hover:brightness-125 disabled:opacity-50"
            style={{
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <FileText size={14} style={{ color: "var(--text-primary)" }} />
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                `.env` file
              </span>
            </div>
            <div
              className="text-[11px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              Keys are stored as plain text in{" "}
              <span className="font-mono">~/.config/thclaws/.env</span>. No
              keychain prompts, works on headless Linux boxes, but anyone
              with read access to your home directory can read the file.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
