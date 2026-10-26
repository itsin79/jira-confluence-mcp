export type Product = "jira" | "confluence";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type QueryValue = string | number | boolean | Array<string | number | boolean>;

type ProductConfig = {
  baseUrl: URL;
  token: string;
};

const RESPONSE_LIMIT = 100_000;
const REQUEST_TIMEOUT_MS = 30_000;

function getConfig(product: Product): ProductConfig {
  const prefix = product === "jira" ? "JIRA" : "CONFLUENCE";
  const baseUrlValue = process.env[`${prefix}_BASE_URL`]?.trim();
  const token = process.env[`${prefix}_PERSONAL_ACCESS_TOKEN`]?.trim();

  if (!baseUrlValue || !token) {
    throw new Error(
      `Set ${prefix}_BASE_URL and ${prefix}_PERSONAL_ACCESS_TOKEN in your MCP client's private environment configuration.`,
    );
  }
  if (/[\r\n]/.test(token)) {
    throw new Error(`${prefix}_PERSONAL_ACCESS_TOKEN contains invalid characters.`);
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch {
    throw new Error(`${prefix}_BASE_URL must be a valid absolute URL.`);
  }

  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new Error(`${prefix}_BASE_URL must use HTTPS or HTTP.`);
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error(`${prefix}_BASE_URL must not contain credentials, a query string, or a fragment.`);
  }
  if (baseUrl.protocol === "http:" && process.env.MCP_ALLOW_INSECURE_HTTP !== "true") {
    throw new Error("HTTP is disabled by default. Set MCP_ALLOW_INSECURE_HTTP=true only for an HTTP-only internal installation.");
  }

  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "");
  return { baseUrl, token };
}

function normalizeRestPath(product: Product, apiPath: string): string {
  const candidate = apiPath.trim().replace(/^\/+|\/+$/g, "");
  if (!candidate || candidate.includes("?") || candidate.includes("#") || candidate.includes("\\") || candidate.includes("%")) {
    throw new Error("apiPath must be a relative REST path without query, fragment, backslash, or percent-encoding.");
  }

  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("apiPath contains an invalid path segment.");
  }
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function buildUrl(product: Product, apiPath: string, query?: Record<string, QueryValue>): { url: URL; config: ProductConfig } {
  const config = getConfig(product);
  const restPath = normalizeRestPath(product, apiPath);
  const contextPath = config.baseUrl.pathname.replace(/\/+$/, "");
  const url = new URL(`${contextPath}/rest/${restPath}`, config.baseUrl.origin);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  if (url.origin !== config.baseUrl.origin || !url.pathname.startsWith(`${contextPath}/rest/`)) {
    throw new Error("Request path escaped the configured Atlassian server.");
  }
  return { url, config };
}

function responseText(value: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, null, 2);
  } catch {
    serialized = String(value);
  }
  if (serialized.length <= RESPONSE_LIMIT) return serialized;
  return `${serialized.slice(0, RESPONSE_LIMIT)}\n… response truncated at ${RESPONSE_LIMIT} characters.`;
}

export async function request(
  product: Product,
  method: HttpMethod,
  apiPath: string,
  options: { query?: Record<string, QueryValue>; body?: unknown } = {},
): Promise<unknown> {
  const { url, config } = buildUrl(product, apiPath, options.query);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${config.token}`,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (product === "confluence" && method !== "GET") {
    headers["X-Atlassian-Token"] = "no-check";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "manual",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    throw new Error(`${product} request failed: ${message}`);
  }

  const rawBody = response.status === 204 ? "" : await response.text();
  let parsed: unknown = rawBody;
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      parsed = rawBody;
    }
  }

  if (!response.ok) {
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`${product} API returned a redirect (HTTP ${response.status}). Set the canonical base URL for this Atlassian instance.`);
    }
    const safeBody = responseText(parsed).replaceAll(config.token, "[REDACTED]");
    throw new Error(`${product} API returned HTTP ${response.status} ${response.statusText}${safeBody ? `: ${safeBody}` : ""}`);
  }
  return parsed;
}

export function toolResult(value: unknown) {
  return { content: [{ type: "text" as const, text: responseText(value) }] };
}

export function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown request error";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

export async function withToolResult<T>(work: () => Promise<T>) {
  try {
    return toolResult(await work());
  } catch (error) {
    return toolError(error);
  }
}
