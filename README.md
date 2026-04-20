# thClaws 🦞

> **Open-source Agent Harness Platform** — Native AI coding agent + workspace + multi-agent coordination. Runs on your own machine. Sovereign by design.

thClaws is a native Rust agent that turns your machine into a full AI workspace: chat, code assistant, multi-agent team, terminal, file editor, media viewer, and a built-in knowledge base. It speaks every major LLM (Anthropic, OpenAI, Google, DashScope, Ollama, and Agentic Press) and reads Claude Code's configuration files unchanged — so you can migrate without rewriting anything.

[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#license)
[![Platform: macOS · Windows · Linux](https://img.shields.io/badge/platform-macOS%20·%20Windows%20·%20Linux-lightgrey.svg)](#installation)

---

## Why thClaws

| Need | How thClaws addresses it |
|---|---|
| **Own your AI stack** | Open source, self-hostable, no vendor lock-in |
| **Data sovereignty** | Run 100% offline with local models (Ollama), or route through a gateway you control |
| **Multi-agent work** | tmux-backed Team View with GUI control of every agent pane |
| **Claude Code compatible** | Reads `CLAUDE.md`, `AGENTS.md`, `.claude/skills/`, `.mcp.json` — drop your repo in and it just works |
| **Knowledge bases** | Built-in KMS (Karpathy-style wiki) with Thai-aware retrieval |
| **Extensible** | Plugins, skills, MCP servers — same format as Claude Code |

---

## Features

- **Multi-provider** — Anthropic Claude, OpenAI GPT, Google Gemini, DashScope Qwen, Ollama (local), Agentic Press
- **Native Rust** — Single binary, fast startup, no Electron overhead
- **Claude Code compatibility** — zero-migration from Anthropic's CLI
- **Agent Teams** — coordinated multi-agent workflows via tmux + GUI
- **Built-in KMS** — personal / project knowledge bases that feed every chat
- **Plugins, Skills, MCP** — extension ecosystem
- **Thai-native** — terminal renders Thai correctly on every OS, KMS uses Thai-aware tokenization
- **OS keychain integration** — keys stored in macOS Keychain / Windows Credential Manager / Linux Secret Service
- **Hooks, sessions, memory, compaction** — production-grade agent loop

---

## Installation

### Pre-built binaries

Download the latest release for your platform from [agentic-press.com/thclaws/downloads](https://agentic-press.com/thclaws/downloads).

macOS (Apple Silicon & Intel), Windows (x86_64), Linux (x86_64, ARM64) supported.

### Build from source

**Prerequisites:** Rust 1.78+, Node.js 20+, pnpm 9+.

```sh
git clone https://github.com/thClaws/thClaws.git
cd thClaws

# Build frontend (React + Vite)
cd frontend && pnpm install && pnpm build && cd ..

# Build Rust (CLI + GUI)
cargo build --release --features gui

# Run
./target/release/thclaws          # GUI
./target/release/thclaws --cli    # CLI
```

---

## Quick start

```sh
# First run: pick a secrets backend (OS keychain or .env) when prompted
thclaws

# Configure your first provider (inside the REPL)
> /provider anthropic
> /model claude-sonnet-4-6

# Drop in your repo's AGENTS.md / CLAUDE.md — it'll be read automatically
```

See `/help` in the REPL for the full command reference.

---

## Configuration

thClaws reads (in precedence order):

1. CLI flags
2. `.thclaws/settings.json` (project)
3. `~/.config/thclaws/settings.json` (user)
4. `~/.claude/settings.json` (Claude Code compatibility)
5. Compiled-in defaults

Claude Code files are honored directly:

- `CLAUDE.md` / `AGENTS.md` — system prompt additions (walked up from cwd)
- `.claude/skills/` / `.thclaws/skills/` — skill catalog
- `.claude/agents/` / `.thclaws/agents/` — subagent definitions
- `.mcp.json` / `.thclaws/mcp.json` — MCP server configuration

---

## Documentation

- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)

For books, training, and commercial deployment, see [agentic-press.com](https://agentic-press.com).

---

## License

Dual-licensed under either:

- [MIT License](LICENSE-MIT)
- [Apache License 2.0](LICENSE-APACHE)

at your option.

---

## About

thClaws is developed by **ThaiGPT Co., Ltd.** and published under a dual MIT/Apache-2.0 license. The client is free and open source forever. Enterprise Edition, hosting, and support are commercial offerings — see [agentic-press.com](https://agentic-press.com) or contact [jimmy@thaigpt.com](mailto:jimmy@thaigpt.com).
