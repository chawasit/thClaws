import { useState, useEffect } from "react";
import { Folder, File, ArrowUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { send, subscribe } from "../hooks/useIPC";

type FileEntry = {
  name: string;
  is_dir: boolean;
};

interface Props {
  active: boolean;
}

export function FilesView({ active }: Props) {
  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [preview, setPreview] = useState<{
    path: string;
    content: string;
    mime: string;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === "file_tree") {
        setEntries(msg.entries as FileEntry[]);
        if (msg.path) setCurrentPath(msg.path as string);
      } else if (msg.type === "file_content") {
        setPreview({
          path: msg.path as string,
          content: msg.content as string,
          mime: msg.mime as string,
        });
      }
    });
    send({ type: "file_list", path: "." });
    return unsub;
  }, []);

  // Auto-refresh the directory listing + current preview while the Files tab
  // is active, so Write/Edit tool calls that land in the working directory
  // show up without the user having to navigate away and back. We don't have
  // an IPC hook for "tool finished" in the GUI (the REPL runs in a PTY child
  // and tool calls are in-process inside it), so polling at a slow cadence is
  // the pragmatic choice.
  useEffect(() => {
    if (!active) return;
    // Refresh immediately when the tab becomes active too.
    send({ type: "file_list", path: currentPath });
    if (preview) send({ type: "file_read", path: preview.path });
    const interval = setInterval(() => {
      send({ type: "file_list", path: currentPath });
      if (preview) send({ type: "file_read", path: preview.path });
    }, 2000);
    return () => clearInterval(interval);
  }, [active, currentPath, preview?.path]);

  const navigate = (name: string) => {
    const path = currentPath === "." ? name : `${currentPath}/${name}`;
    send({ type: "file_list", path });
  };

  const goUp = () => {
    const parent = currentPath.includes("/")
      ? currentPath.substring(0, currentPath.lastIndexOf("/"))
      : ".";
    send({ type: "file_list", path: parent || "." });
  };

  const openFile = (name: string) => {
    const path = currentPath === "." ? name : `${currentPath}/${name}`;
    send({ type: "file_read", path });
  };

  const isMarkdown = preview?.mime === "text/markdown";
  const isHtml = preview?.mime === "text/html";
  const isImage = preview?.mime.startsWith("image/");
  const isPdf = preview?.mime === "application/pdf";

  return (
    <div className="flex h-full" style={{ background: "var(--bg-primary)" }}>
      {/* Tree panel */}
      <div
        className="w-64 overflow-y-auto border-r shrink-0 flex flex-col"
        style={{ borderColor: "var(--border)" }}
      >
        {/* Current path + up button */}
        <div
          className="flex items-center gap-1 px-2 py-1.5 border-b text-[10px] font-mono shrink-0"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          <button
            onClick={goUp}
            className="p-0.5 rounded hover:bg-white/10"
            title="Go up"
          >
            <ArrowUp size={12} />
          </button>
          <span className="truncate">{currentPath}</span>
        </div>

        {/* File list */}
        <div className="overflow-y-auto flex-1 p-1">
          {entries.length === 0 ? (
            <div
              className="text-xs p-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Empty directory
            </div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.name}
                className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs hover:bg-white/5 text-left"
                style={{ color: "var(--text-primary)" }}
                onClick={() =>
                  entry.is_dir ? navigate(entry.name) : openFile(entry.name)
                }
              >
                {entry.is_dir ? (
                  <Folder
                    size={13}
                    style={{ color: "var(--accent)", flexShrink: 0 }}
                  />
                ) : (
                  <File
                    size={13}
                    style={{ color: "var(--text-secondary)", flexShrink: 0 }}
                  />
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Preview panel */}
      <div className="flex-1 min-h-0 flex flex-col p-4">
        {preview ? (
          <div className="flex flex-col flex-1 min-h-0">
            <div
              className="text-xs mb-3 font-mono shrink-0"
              style={{ color: "var(--text-secondary)" }}
            >
              {preview.path}
            </div>
            {isImage ? (
              <div className="flex-1 min-h-0 overflow-auto">
                <img
                  src={`data:${preview.mime};base64,${preview.content}`}
                  alt={preview.path}
                  className="max-w-full rounded"
                />
              </div>
            ) : isPdf ? (
              <iframe
                src={`data:application/pdf;base64,${preview.content}`}
                className="w-full flex-1 min-h-0 rounded border"
                style={{ borderColor: "var(--border)", background: "#fff" }}
                title={preview.path}
              />
            ) : isMarkdown ? (
              <div
                className="prose prose-invert prose-sm max-w-none flex-1 min-h-0 overflow-auto"
                style={{ color: "var(--text-primary)" }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {preview.content}
                </ReactMarkdown>
              </div>
            ) : isHtml ? (
              <iframe
                srcDoc={preview.content}
                className="w-full flex-1 min-h-0 rounded border"
                style={{ borderColor: "var(--border)", background: "#fff" }}
                sandbox="allow-scripts"
                title={preview.path}
              />
            ) : (
              <pre
                className="text-xs font-mono whitespace-pre-wrap rounded p-3 flex-1 min-h-0 overflow-auto"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  tabSize: 4,
                }}
              >
                {preview.content}
              </pre>
            )}
          </div>
        ) : (
          <div
            className="text-sm mt-20 text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            Click a file to preview
          </div>
        )}
      </div>
    </div>
  );
}
