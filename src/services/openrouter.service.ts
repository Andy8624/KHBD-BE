import "dotenv/config";

type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface CompletionOptions {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const LOG_CHUNK_SIZE = 3000;

function getConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new ApiError("Chưa cấu hình OPENROUTER_API_KEY trong backend/.env.", 500);
  }

  if (!model) {
    throw new ApiError("Chưa cấu hình OPENROUTER_MODEL trong backend/.env.", 500);
  }

  return { apiKey, model, baseUrl: baseUrl.replace(/\/$/, "") };
}

function summarizeMessages(messages: ChatMessage[]) {
  return messages.map((message, index) => ({
    index,
    role: message.role,
    length: message.content.length,
    preview: message.content.slice(0, 500)
  }));
}

function logLongText(label: string, text: string) {
  if (!text) {
    console.log(label, "<empty>");
    return;
  }

  const totalChunks = Math.ceil(text.length / LOG_CHUNK_SIZE);
  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * LOG_CHUNK_SIZE;
    const end = Math.min(start + LOG_CHUNK_SIZE, text.length);
    console.log(`${label} chunk ${index + 1}/${totalChunks} chars ${start}-${end}`, text.slice(start, end));
  }
}

export function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

export function parseJsonSafely<T>(raw: string): T {
  const text = stripMarkdownCodeFence(raw);

  try {
    return JSON.parse(text) as T;
  } catch (directError) {
    const firstObject = text.indexOf("{");
    const lastObject = text.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      try {
        return JSON.parse(text.slice(firstObject, lastObject + 1)) as T;
      } catch (slicedError) {
        console.error("[openrouter] sliced json parse failed", slicedError);
      }
    }

    console.error("[openrouter] direct json parse failed", directError);
  }

  console.error("[openrouter] invalid json response metadata", {
    rawLength: raw.length,
    strippedLength: text.length,
    firstBrace: text.indexOf("{"),
    lastBrace: text.lastIndexOf("}")
  });
  logLongText("[openrouter] invalid json raw", raw);
  logLongText("[openrouter] invalid json stripped", text);
  throw new ApiError("AI trả về nội dung chưa đúng định dạng. Vui lòng thử lại.", 502);
}

export async function completeText(messages: ChatMessage[], options: CompletionOptions = {}) {
  const { apiKey, model, baseUrl } = getConfig();
  const startedAt = Date.now();
  const requestPayload = {
    model,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens,
    response_format: options.json ? { type: "json_object" } : undefined
  };

  console.log("[openrouter] request", {
    model,
    baseUrl,
    json: Boolean(options.json),
    temperature: options.temperature ?? 0.4,
    maxTokens: options.maxTokens ?? null,
    messageCount: messages.length
  });
  console.log("[openrouter] message summaries", summarizeMessages(messages));
  logLongText("[openrouter] request body", JSON.stringify(requestPayload, null, 2));

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestPayload)
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error("[openrouter] response error", {
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startedAt,
      responseLength: responseText.length
    });
    logLongText("[openrouter] response error raw", responseText);
    throw new ApiError(
      `Không gọi được OpenRouter. Vui lòng kiểm tra API key, model và thử lại.${responseText ? ` Chi tiết: ${responseText.slice(0, 300)}` : ""}`,
      response.status
    );
  }

  let data: { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
  try {
    data = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
  } catch (error) {
    console.error("[openrouter] non-json api response", error);
    logLongText("[openrouter] non-json api response raw", responseText);
    throw new ApiError("OpenRouter trả về dữ liệu không đọc được. Vui lòng thử lại.", 502);
  }

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    console.error("[openrouter] empty response", {
      durationMs: Date.now() - startedAt,
      usage: data.usage ?? null,
      rawResponseLength: responseText.length
    });
    logLongText("[openrouter] empty response raw payload", responseText);
    throw new ApiError("AI chưa trả về nội dung. Vui lòng thử lại.", 502);
  }

  console.log("[openrouter] response ok", {
    durationMs: Date.now() - startedAt,
    contentLength: content.length,
    usage: data.usage ?? null
  });
  logLongText("[openrouter] response content", content);

  return content;
}

export async function completeJson<T>(messages: ChatMessage[], options: CompletionOptions = {}) {
  const text = await completeText(messages, {
    ...options,
    json: true
  });

  return parseJsonSafely<T>(text);
}
