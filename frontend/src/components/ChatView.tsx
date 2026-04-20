import { useState, useRef, useEffect } from "react";
import { send, subscribe } from "../hooks/useIPC";

type ChatMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
};

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      switch (msg.type) {
        case "chat_text_delta":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + (msg.text as string) },
              ];
            }
            return [...prev, { role: "assistant", content: msg.text as string }];
          });
          break;
        case "chat_tool_call":
          setMessages((prev) => [
            ...prev,
            {
              role: "tool",
              content: `Calling ${msg.name}...`,
              toolName: msg.name as string,
            },
          ]);
          break;
        case "chat_tool_result":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "tool") {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: `${last.toolName} → ${(msg.output as string).slice(0, 200)}`,
                },
              ];
            }
            return prev;
          });
          break;
        case "chat_done":
          setStreaming(false);
          break;
        case "new_session_ack":
          setMessages([]);
          setStreaming(false);
          break;
        case "session_loaded":
          if (msg.messages && Array.isArray(msg.messages)) {
            setMessages(
              (msg.messages as { role: string; content: string }[])
                .filter((m) => m.role !== "system")
                .map((m) => ({
                  role: m.role === "assistant" ? "assistant" : m.role === "tool" ? "tool" : "user",
                  content: m.content,
                } as ChatMessage))
            );
          }
          setStreaming(false);
          break;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSlashCommand = (text: string): boolean => {
    const cmd = text.trim().toLowerCase();
    if (cmd === "/exit" || cmd === "/quit" || cmd === "/q") {
      send({ type: "new_session" }); // save + clear
      // Close the window via a small delay to let save complete
      setTimeout(() => window.close(), 200);
      return true;
    }
    if (cmd === "/clear") {
      send({ type: "new_session" });
      return true;
    }
    if (cmd === "/help" || cmd === "/h" || cmd === "/?") {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Chat mode slash commands:\n" +
            "/clear — save session + clear chat\n" +
            "/exit, /quit — save session + close app\n" +
            "/help — show this help\n\n" +
            "For full slash commands, use the Terminal tab.",
        },
      ]);
      return true;
    }
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    if (text.startsWith("/") && handleSlashCommand(text)) {
      return;
    }
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStreaming(true);
    send({ type: "chat_prompt", text });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3"
        style={{ background: "var(--bg-primary)" }}
      >
        {messages.length === 0 && (
          <div
            className="text-center mt-20 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Chat mode — send a message to start
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
              style={{
                background:
                  msg.role === "user"
                    ? "var(--accent-dim)"
                    : msg.role === "tool"
                      ? "var(--bg-tertiary)"
                      : "var(--bg-secondary)",
                color: "var(--text-primary)",
                border:
                  msg.role === "tool"
                    ? "1px solid var(--border)"
                    : "none",
                fontFamily:
                  msg.role === "tool"
                    ? "Menlo, Monaco, monospace"
                    : "inherit",
                fontSize: msg.role === "tool" ? "12px" : "14px",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 p-3 border-t"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={streaming ? "Waiting for response..." : "Type a message..."}
          disabled={streaming}
          className="flex-1 px-3 py-2 rounded text-sm outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="px-4 py-2 rounded text-sm font-medium transition-colors"
          style={{
            background: streaming ? "var(--bg-tertiary)" : "var(--accent)",
            color: streaming ? "var(--text-secondary)" : "#000",
            cursor: streaming ? "not-allowed" : "pointer",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
