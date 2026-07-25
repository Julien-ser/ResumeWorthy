/**
 * POST-based SSE client. Native EventSource only supports GET requests with
 * no custom headers, which can't carry the Clerk auth Bearer token or a JSON
 * body -- so this reads the fetch() response body stream directly and parses
 * the backend's "event: X\ndata: Y\n\n" frames by hand.
 */

export interface SSEEvent<T = any> {
  event: string;
  data: T;
}

export class SSEError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function* streamSSE<T = any>(
  url: string,
  options: { headers?: Record<string, string>; body?: string; signal?: AbortSignal }
): AsyncGenerator<SSEEvent<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: options.body,
    signal: options.signal,
  });

  if (!res.ok || !res.body) {
    let detail = `Request failed (${res.status})`;
    try {
      const d = await res.json();
      if (d?.detail) detail = String(d.detail);
    } catch {}
    throw new SSEError(detail, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseFrame<T>(rawFrame);
      if (parsed) yield parsed;
    }
  }
}

function parseFrame<T>(raw: string): SSEEvent<T> | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  const dataStr = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(dataStr) as T };
  } catch {
    return { event, data: dataStr as unknown as T };
  }
}
