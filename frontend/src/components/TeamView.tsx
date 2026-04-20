import { useEffect, useRef, useState } from "react";
import { subscribe, send } from "../hooks/useIPC";

const ANSI_COLORS: Record<number, string> = {
  30: "#4d4d4d", 31: "#e06c75", 32: "#98c379", 33: "#e5c07b",
  34: "#61afef", 35: "#c678dd", 36: "#56b6c2", 37: "#e6e6e6",
  90: "#888", 91: "#e06c75", 92: "#98c379", 93: "#e5c07b",
  94: "#61afef", 95: "#c678dd", 96: "#56b6c2", 97: "#ffffff",
};

function ansiToHtml(text: string): string {
  // Escape HTML entities first.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Parse ANSI escape sequences into balanced <span> tags.
  let out = "";
  let open = 0;
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(escaped)) !== null) {
    out += escaped.slice(last, m.index);
    last = m.index + m[0].length;
    const codes = m[1];
    if (!codes || codes === "0") {
      if (open > 0) { out += "</span>".repeat(open); open = 0; }
      continue;
    }
    const parts = codes.split(";").map(Number);
    const styles: string[] = [];
    for (const code of parts) {
      if (code === 1) styles.push("font-weight:bold");
      else if (code === 2 || code === 90) styles.push("opacity:0.6");
      else if (ANSI_COLORS[code]) styles.push(`color:${ANSI_COLORS[code]}`);
    }
    if (styles.length === 0) continue;
    // Close any prior span so styles don't stack unexpectedly.
    if (open > 0) { out += "</span>".repeat(open); open = 0; }
    out += `<span style="${styles.join(";")}">`;
    open = 1;
  }
  out += escaped.slice(last);
  if (open > 0) out += "</span>".repeat(open);
  return out;
}

interface AgentInfo {
  name: string;
  status: string;
  task: string | null;
  output: string[];
}

export function TeamView() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === "team_status" && Array.isArray(msg.agents)) {
        setAgents(
          msg.agents.map((a: any) => ({
            name: a.name || a.agent || "?",
            status: a.status || "unknown",
            task: a.task || a.current_task || null,
            output: a.output || [],
          }))
        );
      } else if (
        msg.type === "team_agent_output" &&
        typeof msg.agent === "string" &&
        typeof msg.line === "string"
      ) {
        setAgents((prev) =>
          prev.map((a) =>
            a.name === msg.agent
              ? { ...a, output: [...a.output.slice(-200), msg.line as string] }
              : a
          )
        );
      }
    });

    send({ type: "team_list" });
    const interval = setInterval(() => send({ type: "team_list" }), 3000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  if (agents.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: "var(--text-secondary)" }}
      >
        <div className="text-center">
          <p className="text-sm">No team agents running</p>
          <p className="text-xs mt-2">
            Ask the agent to create a team — teammates will appear here
          </p>
        </div>
      </div>
    );
  }

  const cols = agents.length <= 1 ? 1 : agents.length <= 4 ? 2 : 3;

  return (
    <div
      className="h-full w-full grid gap-px overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${Math.ceil(agents.length / cols)}, 1fr)`,
        background: "var(--border)",
      }}
    >
      {agents.map((agent) => (
        <AgentPane key={agent.name} agent={agent} />
      ))}
    </div>
  );
}

function AgentPane({ agent }: { agent: AgentInfo }) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const lastLine = agent.output[agent.output.length - 1] ?? "";
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agent.output.length, lastLine]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    send({ type: "team_send_message", to: agent.name, text });
    setInput("");
  }

  const statusColor =
    agent.status === "working"
      ? "var(--warning)"
      : agent.status === "idle"
      ? "var(--text-secondary)"
      : "var(--accent)";

  return (
    <div className="flex flex-col min-h-0" style={{ background: "#0a0a0a" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1 text-[10px] font-medium shrink-0 select-none"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ color: "var(--accent)" }}>{agent.name}</span>
        <span style={{ color: statusColor }}>
          {agent.status}
          {agent.task ? ` · ${agent.task}` : ""}
        </span>
      </div>

      {/* Output */}
      <div
        className="flex-1 min-h-0 overflow-y-auto p-1.5 font-mono text-[11px] leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {agent.output.length > 0 ? (
          <div
            className="whitespace-pre-wrap break-all"
            dangerouslySetInnerHTML={{ __html: ansiToHtml(agent.output.join("\n")) }}
          />
        ) : (
          <span style={{ color: "var(--text-secondary)" }}>
            waiting for messages...
          </span>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      {(
        <div
          className="shrink-0 flex gap-1 p-1"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <input
            type="text"
            className="flex-1 px-1.5 py-0.5 rounded text-[11px] font-mono outline-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            placeholder={`Message ${agent.name}...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
          />
          <button
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{
              background: "var(--accent-dim)",
              color: "var(--text-primary)",
            }}
            onClick={handleSend}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
