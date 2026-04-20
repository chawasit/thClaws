//! Core message/content types mirroring the Anthropic wire format.
//!
//! These are the canonical in-memory shape. Provider modules (Anthropic, OpenAI)
//! are responsible for adapting their own wire formats to/from these types.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
    System,
}

/// A single piece of message content.
///
/// `#[serde(tag = "type", rename_all = "snake_case")]` produces the Anthropic wire
/// format: `{"type":"text","text":"..."}` / `{"type":"tool_use",...}` / etc.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        is_error: bool,
    },
}

impl ContentBlock {
    pub fn text(s: impl Into<String>) -> Self {
        ContentBlock::Text { text: s.into() }
    }
}

/// A single message in the conversation history.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Message {
    pub role: Role,
    pub content: Vec<ContentBlock>,
}

impl Message {
    pub fn user(text: impl Into<String>) -> Self {
        Message {
            role: Role::User,
            content: vec![ContentBlock::text(text)],
        }
    }

    pub fn assistant(text: impl Into<String>) -> Self {
        Message {
            role: Role::Assistant,
            content: vec![ContentBlock::text(text)],
        }
    }
}

/// A tool definition exposed to the model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn role_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Role::User).unwrap(), "\"user\"");
        assert_eq!(
            serde_json::to_string(&Role::Assistant).unwrap(),
            "\"assistant\""
        );
    }

    #[test]
    fn text_block_anthropic_wire_shape() {
        let block = ContentBlock::text("hello");
        let j = serde_json::to_value(&block).unwrap();
        assert_eq!(j, serde_json::json!({"type": "text", "text": "hello"}));
    }

    #[test]
    fn tool_use_block_wire_shape() {
        let block = ContentBlock::ToolUse {
            id: "toolu_1".into(),
            name: "read_file".into(),
            input: serde_json::json!({"path": "/tmp/x"}),
        };
        let j = serde_json::to_value(&block).unwrap();
        assert_eq!(
            j,
            serde_json::json!({
                "type": "tool_use",
                "id": "toolu_1",
                "name": "read_file",
                "input": {"path": "/tmp/x"}
            })
        );
    }

    #[test]
    fn tool_result_skips_is_error_when_false() {
        let block = ContentBlock::ToolResult {
            tool_use_id: "toolu_1".into(),
            content: "ok".into(),
            is_error: false,
        };
        let j = serde_json::to_value(&block).unwrap();
        assert_eq!(
            j,
            serde_json::json!({
                "type": "tool_result",
                "tool_use_id": "toolu_1",
                "content": "ok"
            })
        );
    }

    #[test]
    fn tool_result_includes_is_error_when_true() {
        let block = ContentBlock::ToolResult {
            tool_use_id: "toolu_1".into(),
            content: "boom".into(),
            is_error: true,
        };
        let j = serde_json::to_value(&block).unwrap();
        assert_eq!(j["is_error"], serde_json::Value::Bool(true));
    }

    #[test]
    fn message_roundtrip() {
        let m = Message::user("hi");
        let s = serde_json::to_string(&m).unwrap();
        let back: Message = serde_json::from_str(&s).unwrap();
        assert_eq!(m, back);
    }
}
