//! Permission / approval infrastructure for tool execution.
//!
//! Design:
//! - [`PermissionMode`] in `AppConfig` picks the overall policy: `Auto` (never
//!   prompt), `Ask` (prompt whenever a tool's `requires_approval` returns true).
//! - Each [`Tool`][crate::tools::Tool] can override `requires_approval` to
//!   declare itself mutating. Read-only tools default to `false`.
//! - The agent loop consults the active mode + tool flag before calling, and
//!   asks an [`ApprovalSink`] for a decision if necessary. Sinks are pluggable:
//!   the REPL wires one that prompts on stdin, tests wire a scripted one.
//! - [`ApprovalDecision::AllowForSession`] is the "yolo" case — future calls
//!   from the same sink auto-approve. Tracking lives inside the sink so the
//!   agent just sees Allow/Deny.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionMode {
    /// Never prompt; every tool call is auto-approved. Matches the pre-Phase-11
    /// behavior. Useful for non-interactive runs and tests.
    Auto,
    /// Prompt on any tool whose `requires_approval` returns true.
    Ask,
}

impl Default for PermissionMode {
    fn default() -> Self {
        PermissionMode::Ask
    }
}

#[derive(Debug, Clone)]
pub struct ApprovalRequest {
    pub tool_name: String,
    pub input: Value,
    /// Optional short preview line the sink can show to the user.
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalDecision {
    /// Approve this one call.
    Allow,
    /// Approve this call and every subsequent one from the same sink.
    AllowForSession,
    /// Deny. The agent surfaces this as a ToolResult with is_error=true.
    Deny,
}

#[async_trait]
pub trait ApprovalSink: Send + Sync {
    async fn approve(&self, req: &ApprovalRequest) -> ApprovalDecision;
}

/// Always-allow sink. Matches `PermissionMode::Auto` behavior but can also be
/// used directly when the mode is `Ask` but the caller wants a bypass.
pub struct AutoApprover;

#[async_trait]
impl ApprovalSink for AutoApprover {
    async fn approve(&self, _req: &ApprovalRequest) -> ApprovalDecision {
        ApprovalDecision::Allow
    }
}

/// Always-deny sink, for tests.
pub struct DenyApprover;

#[async_trait]
impl ApprovalSink for DenyApprover {
    async fn approve(&self, _req: &ApprovalRequest) -> ApprovalDecision {
        ApprovalDecision::Deny
    }
}

/// Scripted sink for integration tests. Plays back a queue of decisions.
/// `AllowForSession` flips an internal flag so subsequent calls auto-approve.
pub struct ScriptedApprover {
    decisions: std::sync::Mutex<std::collections::VecDeque<ApprovalDecision>>,
    session_allowed: AtomicBool,
}

impl ScriptedApprover {
    pub fn new(decisions: Vec<ApprovalDecision>) -> Arc<Self> {
        Arc::new(Self {
            decisions: std::sync::Mutex::new(decisions.into()),
            session_allowed: AtomicBool::new(false),
        })
    }
}

#[async_trait]
impl ApprovalSink for ScriptedApprover {
    async fn approve(&self, _req: &ApprovalRequest) -> ApprovalDecision {
        if self.session_allowed.load(Ordering::Relaxed) {
            return ApprovalDecision::Allow;
        }
        let next = self
            .decisions
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(ApprovalDecision::Deny);
        if matches!(next, ApprovalDecision::AllowForSession) {
            self.session_allowed.store(true, Ordering::Relaxed);
            return ApprovalDecision::Allow;
        }
        next
    }
}

/// REPL-backed sink: prints a prompt on stdout and reads a line from stdin.
/// Supports `y/yes`, `n/no`, and `yolo` (= AllowForSession). Uses
/// `tokio::task::spawn_blocking` so the blocking I/O doesn't starve other tasks.
pub struct ReplApprover {
    session_allowed: AtomicBool,
}

impl ReplApprover {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            session_allowed: AtomicBool::new(false),
        })
    }
}

impl Default for ReplApprover {
    fn default() -> Self {
        Self {
            session_allowed: AtomicBool::new(false),
        }
    }
}

#[async_trait]
impl ApprovalSink for ReplApprover {
    async fn approve(&self, req: &ApprovalRequest) -> ApprovalDecision {
        if self.session_allowed.load(Ordering::Relaxed) {
            return ApprovalDecision::Allow;
        }
        let preview = req
            .summary
            .clone()
            .unwrap_or_else(|| serde_json::to_string(&req.input).unwrap_or_default());
        let prompt = format!(
            "\n\x1b[33m[approval] {} input={}\x1b[0m\n\x1b[90m[y]es / [n]o / yolo ▸ \x1b[0m",
            req.tool_name, preview
        );
        let answer = tokio::task::spawn_blocking(move || {
            use std::io::{BufRead, Write};
            let _ = std::io::stdout().write_all(prompt.as_bytes());
            let _ = std::io::stdout().flush();
            let mut line = String::new();
            let _ = std::io::stdin().lock().read_line(&mut line);
            line.trim().to_lowercase()
        })
        .await
        .unwrap_or_default();

        match answer.as_str() {
            "y" | "yes" => ApprovalDecision::Allow,
            "yolo" => {
                self.session_allowed.store(true, Ordering::Relaxed);
                ApprovalDecision::Allow
            }
            _ => ApprovalDecision::Deny,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn auto_approver_always_allows() {
        let a = AutoApprover;
        let req = ApprovalRequest {
            tool_name: "X".into(),
            input: serde_json::json!({}),
            summary: None,
        };
        assert_eq!(a.approve(&req).await, ApprovalDecision::Allow);
    }

    #[tokio::test]
    async fn deny_approver_always_denies() {
        let d = DenyApprover;
        let req = ApprovalRequest {
            tool_name: "X".into(),
            input: serde_json::json!({}),
            summary: None,
        };
        assert_eq!(d.approve(&req).await, ApprovalDecision::Deny);
    }

    #[tokio::test]
    async fn scripted_approver_plays_back_queue_and_defaults_to_deny() {
        let a = ScriptedApprover::new(vec![ApprovalDecision::Allow, ApprovalDecision::Deny]);
        let req = ApprovalRequest {
            tool_name: "T".into(),
            input: serde_json::json!({}),
            summary: None,
        };
        assert_eq!(a.approve(&req).await, ApprovalDecision::Allow);
        assert_eq!(a.approve(&req).await, ApprovalDecision::Deny);
        // Queue exhausted → defaults to Deny
        assert_eq!(a.approve(&req).await, ApprovalDecision::Deny);
    }

    #[tokio::test]
    async fn allow_for_session_sticks_after_first_call() {
        let a = ScriptedApprover::new(vec![ApprovalDecision::AllowForSession]);
        let req = ApprovalRequest {
            tool_name: "T".into(),
            input: serde_json::json!({}),
            summary: None,
        };
        // First call resolves AllowForSession → Allow (and sets the flag).
        assert_eq!(a.approve(&req).await, ApprovalDecision::Allow);
        // Subsequent calls auto-allow even though the queue is empty.
        assert_eq!(a.approve(&req).await, ApprovalDecision::Allow);
        assert_eq!(a.approve(&req).await, ApprovalDecision::Allow);
    }

    #[test]
    fn permission_mode_default_is_ask() {
        assert_eq!(PermissionMode::default(), PermissionMode::Ask);
    }

    #[test]
    fn permission_mode_serde_lowercase() {
        assert_eq!(
            serde_json::to_string(&PermissionMode::Auto).unwrap(),
            "\"auto\""
        );
        assert_eq!(
            serde_json::to_string(&PermissionMode::Ask).unwrap(),
            "\"ask\""
        );
    }
}
