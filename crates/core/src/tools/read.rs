use super::{req_str, Tool};
use crate::error::{Error, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

pub struct ReadTool;

#[async_trait]
impl Tool for ReadTool {
    fn name(&self) -> &'static str {
        "Read"
    }

    fn description(&self) -> &'static str {
        "Read the contents of a file. Optional `offset` (1-indexed line) and `limit` \
         (max lines) select a slice; omit for the whole file."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the file"},
                "offset": {"type": "integer", "description": "Start line (1-indexed)"},
                "limit":  {"type": "integer", "description": "Max number of lines"}
            },
            "required": ["path"]
        })
    }

    async fn call(&self, input: Value) -> Result<String> {
        let raw_path = req_str(&input, "path")?;
        let path = crate::sandbox::Sandbox::check(raw_path)?;
        let offset = input.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
        let limit = input
            .get("limit")
            .and_then(Value::as_u64)
            .map(|n| n as usize);

        let contents = std::fs::read_to_string(&path)
            .map_err(|e| Error::Tool(format!("read {}: {e}", path.display())))?;

        if offset == 0 && limit.is_none() {
            return Ok(contents);
        }

        let lines: Vec<&str> = contents.lines().collect();
        let start = offset.saturating_sub(1).min(lines.len());
        let end = limit
            .map(|l| start.saturating_add(l))
            .unwrap_or(lines.len())
            .min(lines.len());
        Ok(lines[start..end].join("\n"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn reads_whole_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("hello.txt");
        std::fs::write(&path, "line1\nline2\nline3\n").unwrap();

        let out = ReadTool
            .call(json!({"path": path.to_string_lossy()}))
            .await
            .unwrap();
        assert_eq!(out, "line1\nline2\nline3\n");
    }

    #[tokio::test]
    async fn reads_slice_with_offset_and_limit() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("many.txt");
        std::fs::write(&path, "a\nb\nc\nd\ne\n").unwrap();

        let out = ReadTool
            .call(json!({
                "path": path.to_string_lossy(),
                "offset": 2,
                "limit": 2
            }))
            .await
            .unwrap();
        assert_eq!(out, "b\nc");
    }

    #[tokio::test]
    async fn missing_path_errors() {
        let err = ReadTool.call(json!({})).await.unwrap_err();
        assert!(format!("{err}").contains("path"));
    }

    #[tokio::test]
    async fn nonexistent_file_errors() {
        let err = ReadTool
            .call(json!({"path": "/nope/does/not/exist.txt"}))
            .await
            .unwrap_err();
        let s = format!("{err}");
        assert!(s.contains("read"));
    }

    #[tokio::test]
    async fn offset_past_end_returns_empty() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("tiny.txt");
        std::fs::write(&path, "only-line\n").unwrap();
        let out = ReadTool
            .call(json!({
                "path": path.to_string_lossy(),
                "offset": 100,
                "limit": 10
            }))
            .await
            .unwrap();
        assert_eq!(out, "");
    }
}
