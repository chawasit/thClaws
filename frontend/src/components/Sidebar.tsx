import { useState, useEffect } from "react";
import { Plus, Pencil } from "lucide-react";
import { send, subscribe } from "../hooks/useIPC";

type SessionInfo = { id: string; model: string; messages: number; title?: string | null };
type KmsInfo = { name: string; scope: "user" | "project"; active: boolean };

export function Sidebar() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeProvider, setActiveProvider] = useState("anthropic");
  const [activeModel, setActiveModel] = useState("claude-sonnet-4-5");
  const [providerReady, setProviderReady] = useState(true);
  const [mcpServers, setMcpServers] = useState<
    { name: string; tools: number }[]
  >([]);
  const [kmss, setKmss] = useState<KmsInfo[]>([]);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === "new_session_ack") {
        // Chat UI handles clearing; sessions_list arrives separately.
      } else if (msg.type === "sessions_list") {
        if (msg.sessions) {
          setSessions(msg.sessions as SessionInfo[]);
        }
      } else if (msg.type === "initial_state" || msg.type === "provider_update") {
        if (msg.provider) setActiveProvider(msg.provider as string);
        if (msg.model) setActiveModel(msg.model as string);
        if (typeof msg.provider_ready === "boolean") {
          setProviderReady(msg.provider_ready);
        }
        if (msg.mcp_servers) {
          setMcpServers(msg.mcp_servers as { name: string; tools: number }[]);
        }
        if (msg.sessions) {
          setSessions(msg.sessions as SessionInfo[]);
        }
        if (msg.kmss) {
          setKmss(msg.kmss as KmsInfo[]);
        }
      } else if (msg.type === "sessions_list") {
        setSessions(msg.sessions as SessionInfo[]);
      } else if (msg.type === "mcp_update") {
        setMcpServers(msg.servers as { name: string; tools: number }[]);
      } else if (msg.type === "kms_update") {
        setKmss(msg.kmss as KmsInfo[]);
      }
    });
    return unsub;
  }, []);

  // Poll config every 5s to pick up model/provider changes from Terminal PTY.
  useEffect(() => {
    const interval = setInterval(() => send({ type: "config_poll" }), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="w-48 border-r overflow-y-auto shrink-0 text-xs"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      {/* Provider */}
      <Section title="Provider">
        <div className="px-2 py-1">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: providerReady
                  ? "var(--accent)"
                  : "var(--danger, #e06c75)",
              }}
              title={providerReady ? "Provider ready" : "No API key configured"}
            />
            <span
              style={{
                color: providerReady
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                textDecoration: providerReady ? "none" : "line-through",
              }}
              title={providerReady ? undefined : "No API key — open the gear → Provider API keys"}
            >
              {activeProvider}
            </span>
          </div>
          <div
            className="ml-3 font-mono"
            style={{ color: "var(--text-secondary)", fontSize: "10px" }}
          >
            {activeModel}
          </div>
          {!providerReady && (
            <div
              className="ml-3 mt-1"
              style={{ color: "var(--danger, #e06c75)", fontSize: "10px" }}
            >
              no API key — set one in Settings
            </div>
          )}
        </div>
      </Section>

      {/* Sessions */}
      <Section
        title="Sessions"
        action={
          <button
            className="p-0.5 rounded hover:bg-white/10"
            title="New session (save current + clear)"
            onClick={() => send({ type: "new_session" })}
          >
            <Plus size={12} />
          </button>
        }
      >
        {sessions.length === 0 ? (
          <div className="px-2 py-1" style={{ color: "var(--text-secondary)" }}>
            No saved sessions
          </div>
        ) : (
          sessions.slice(0, 10).map((s) => {
            const label = s.title && s.title.trim().length > 0
              ? s.title
              : s.id;
            return (
              <div
                key={s.id}
                className="group flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
              >
                <button
                  className="flex-1 text-left truncate"
                  style={{ color: "var(--text-primary)" }}
                  onClick={() => send({ type: "session_load", id: s.id })}
                  title={s.title ? `${s.title} (${s.id}) — ${s.messages} msg` : `${s.id} — ${s.messages} msg`}
                >
                  <span
                    className={s.title ? "" : "font-mono"}
                    style={{ fontSize: s.title ? "12px" : "10px" }}
                  >
                    {label}
                  </span>
                </button>
                <button
                  className="p-0.5 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="Rename session"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = window.prompt(
                      "Rename session (empty to clear):",
                      s.title ?? "",
                    );
                    if (next !== null) {
                      send({ type: "session_rename", id: s.id, title: next });
                    }
                  }}
                >
                  <Pencil size={10} style={{ color: "var(--text-secondary)" }} />
                </button>
              </div>
            );
          })
        )}
      </Section>

      {/* Knowledge bases */}
      <Section
        title="Knowledge"
        action={
          <button
            className="p-0.5 rounded hover:bg-white/10"
            title="New KMS"
            onClick={() => {
              const name = window.prompt(
                "New KMS name (letters, digits, -, _):",
                "",
              );
              if (!name) return;
              const trimmed = name.trim();
              if (!trimmed) return;
              const scope = window.confirm(
                `Scope?\n\nOK = user (~/.config/thclaws/kms/${trimmed})\nCancel = project (./.thclaws/kms/${trimmed})`,
              )
                ? "user"
                : "project";
              send({ type: "kms_new", name: trimmed, scope });
            }}
          >
            <Plus size={12} />
          </button>
        }
      >
        {kmss.length === 0 ? (
          <div className="px-2 py-1" style={{ color: "var(--text-secondary)" }}>
            None yet
          </div>
        ) : (
          kmss.map((k) => (
            <label
              key={`${k.scope}:${k.name}`}
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
              title={`${k.scope} scope`}
            >
              <input
                type="checkbox"
                checked={k.active}
                onChange={(e) =>
                  send({
                    type: "kms_toggle",
                    name: k.name,
                    active: e.target.checked,
                  })
                }
              />
              <span style={{ color: "var(--text-primary)" }}>{k.name}</span>
              <span style={{ color: "var(--text-secondary)", fontSize: "10px" }}>
                {k.scope === "project" ? "(proj)" : ""}
              </span>
            </label>
          ))
        )}
      </Section>

      {/* MCP */}
      <Section title="MCP Servers">
        {mcpServers.length === 0 ? (
          <div className="px-2 py-1" style={{ color: "var(--text-secondary)" }}>
            None configured
          </div>
        ) : (
          mcpServers.map((s) => (
            <div
              key={s.name}
              className="px-2 py-1"
              style={{ color: "var(--text-primary)" }}
            >
              {s.name}{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                ({s.tools})
              </span>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div
        className="px-2 py-1.5 font-semibold uppercase tracking-wider flex items-center justify-between"
        style={{
          color: "var(--text-secondary)",
          fontSize: "10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {title}
        {action}
      </div>
      <div className="py-1">{children}</div>
    </div>
  );
}
