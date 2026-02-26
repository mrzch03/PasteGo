use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub content: String,
    pub done: bool,
}

pub async fn stream_generate(
    app: AppHandle,
    kind: &str,
    endpoint: &str,
    model: &str,
    api_key: &str,
    prompt: &str,
) -> Result<String, String> {
    match kind {
        "openai" | "kimi" | "minimax" => stream_openai(app, endpoint, model, api_key, prompt).await,
        "claude" => stream_claude(app, endpoint, model, api_key, prompt).await,
        "ollama" => stream_ollama(app, endpoint, model, prompt).await,
        _ => Err(format!("Unknown provider kind: {}", kind)),
    }
}

async fn stream_openai(
    app: AppHandle,
    endpoint: &str,
    model: &str,
    api_key: &str,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": true
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let mut full_content = String::new();
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" {
                    let _ = app.emit("ai-stream", StreamChunk { content: String::new(), done: true });
                    return Ok(full_content);
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                        full_content.push_str(delta);
                        let _ = app.emit("ai-stream", StreamChunk { content: delta.to_string(), done: false });
                    }
                }
            }
        }
    }

    let _ = app.emit("ai-stream", StreamChunk { content: String::new(), done: true });
    Ok(full_content)
}

async fn stream_claude(
    app: AppHandle,
    endpoint: &str,
    model: &str,
    api_key: &str,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/messages", endpoint.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": prompt}],
        "stream": true
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let mut full_content = String::new();
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    let event_type = parsed["type"].as_str().unwrap_or("");
                    match event_type {
                        "content_block_delta" => {
                            if let Some(text) = parsed["delta"]["text"].as_str() {
                                full_content.push_str(text);
                                let _ = app.emit("ai-stream", StreamChunk { content: text.to_string(), done: false });
                            }
                        }
                        "message_stop" => {
                            let _ = app.emit("ai-stream", StreamChunk { content: String::new(), done: true });
                            return Ok(full_content);
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    let _ = app.emit("ai-stream", StreamChunk { content: String::new(), done: true });
    Ok(full_content)
}

async fn stream_ollama(
    app: AppHandle,
    endpoint: &str,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/api/generate", endpoint.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": true
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let mut full_content = String::new();
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() {
                continue;
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(response_text) = parsed["response"].as_str() {
                    full_content.push_str(response_text);
                    let _ = app.emit("ai-stream", StreamChunk { content: response_text.to_string(), done: false });
                }
                if parsed["done"].as_bool() == Some(true) {
                    let _ = app.emit("ai-stream", StreamChunk { content: String::new(), done: true });
                    return Ok(full_content);
                }
            }
        }
    }

    let _ = app.emit("ai-stream", StreamChunk { content: String::new(), done: true });
    Ok(full_content)
}
