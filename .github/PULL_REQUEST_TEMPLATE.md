## Summary

Briefly describe what this PR does.

## Motivation

Why is this change needed? Link the issue it closes (e.g. `Closes #123`).

## Changes

- ...
- ...

## Test plan

How did you verify this works?

- [ ] `cargo test --features gui` passes locally
- [ ] `cargo fmt --check` passes
- [ ] `cargo clippy --features gui -- -D warnings` passes
- [ ] Frontend type-check passes (`cd frontend && pnpm tsc --noEmit`) — if frontend touched
- [ ] Manually exercised the feature — steps:
  1. ...
  2. ...

## Screenshots / recordings

For GUI / CLI UX changes, include a before / after screenshot or short recording.

## Checklist

- [ ] Tests added or updated
- [ ] Documentation updated if behavior changes (README / CHANGELOG / in-repo docs)
- [ ] No new compiler warnings introduced
- [ ] PR scope is focused — no unrelated changes
- [ ] Commits follow project style (concise, imperative, optional `feat/fix/docs/...` prefix)
