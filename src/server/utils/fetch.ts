export type FetchJsonOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export class ExternalApiError extends Error {
  status: number;
  url: string;
  details?: unknown;

  constructor(args: { status: number; url: string; message: string; details?: unknown }) {
    super(args.message);
    this.status = args.status;
    this.url = args.url;
    this.details = args.details;
  }
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);

  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    let payload: any = null;
    if (isJson) {
      payload = await res.json().catch(() => null);
    } else {
      payload = await res.text().catch(() => null);
    }

    if (!res.ok) {
      const message =
        (payload && typeof payload === "object" && (payload.message || payload.error))
          ? String(payload.message || payload.error)
          : `Request failed with status ${res.status}`;
      throw new ExternalApiError({ status: res.status, url, message, details: payload });
    }

    return payload as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new ExternalApiError({ status: 504, url, message: "Request timed out" });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
