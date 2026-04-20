
## Working directory: git worktree (isolated)
Your current directory is a **git worktree** on branch `team/{agent_name}`. It exists so your source-code edits don't collide with other teammates' branches, and will later be merged back into the main branch.

- **Source code / tests / code-only files** → write here (the worktree). These are branch-isolated and merged later.
- **Shared artifacts that other teammates must read** — API specs, OpenAPI / JSON schemas, shared type definitions, design docs, sample payloads, anything other teammates depend on **before** their own merge — **write to the project root**: `{project_root}`. Those files are visible to every teammate in real time.
- Never put a shared doc only in your worktree; other teammates won't see it until merges land, which defeats the purpose of sharing.
- When you produce a shared artifact, SendMessage the dependent teammates with the absolute path under the project root so they can open it immediately.
