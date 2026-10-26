import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { request, withToolResult, type QueryValue } from "./http.js";

const pageNumber = z.number().int().min(0).default(0);
const pageSize = z.number().int().min(1).max(100).default(50);
const fields = z.array(z.string()).optional();
const genericBody = z.unknown().optional();
const rawQuery = z.record(z.string(), z.union([
  z.string(), z.number(), z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
])).optional();

const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
const writeAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
const deleteAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

export function registerConfluenceTools(server: McpServer): void {
  server.registerTool("confluence_get_current_user", {
    title: "Get Confluence current user",
    description: "Return the authenticated Confluence user.",
    inputSchema: z.object({}),
    annotations: readAnnotations,
  }, async () => withToolResult(() => request("confluence", "GET", "api/user/current")));

  server.registerTool("confluence_search", {
    title: "Search Confluence content",
    description: "Search pages, blog posts, comments, and other content with Confluence Query Language (CQL). Use start and limit for pagination.",
    inputSchema: z.object({ cql: z.string().min(1), start: pageNumber, limit: pageSize, expand: z.array(z.string()).optional() }),
    annotations: readAnnotations,
  }, async ({ cql, start, limit, expand }) => withToolResult(() => request("confluence", "GET", "api/search", {
    query: { cql, start, limit, ...(expand ? { expand } : {}) },
  })));

  server.registerTool("confluence_list_spaces", {
    title: "List Confluence spaces",
    description: "List spaces visible to the authenticated user. Use start and limit for pagination.",
    inputSchema: z.object({ start: pageNumber, limit: pageSize, type: z.string().optional(), status: z.string().optional(), expand: z.array(z.string()).optional() }),
    annotations: readAnnotations,
  }, async ({ start, limit, type, status, expand }) => withToolResult(() => request("confluence", "GET", "api/space", {
    query: { start, limit, ...(type ? { type } : {}), ...(status ? { status } : {}), ...(expand ? { expand } : {}) },
  })));

  server.registerTool("confluence_get_page", {
    title: "Get Confluence page",
    description: "Read a Confluence content item by ID, including body, version, space, and ancestors by default.",
    inputSchema: z.object({ contentId: z.string().min(1), expand: z.array(z.string()).optional() }),
    annotations: readAnnotations,
  }, async ({ contentId, expand }) => withToolResult(() => request("confluence", "GET", `api/content/${contentId}`, {
    query: { expand: expand ?? ["body.storage", "version", "space", "ancestors"] },
  })));

  server.registerTool("confluence_create_page", {
    title: "Create Confluence page",
    description: "Create a page in a space. bodyStorage must be Confluence Storage Format markup, commonly HTML with Confluence macros. Optionally set parentPageId to create a child page.",
    inputSchema: z.object({ spaceKey: z.string().min(1), title: z.string().min(1), bodyStorage: z.string().min(1), parentPageId: z.string().optional() }),
    annotations: writeAnnotations,
  }, async ({ spaceKey, title, bodyStorage, parentPageId }) => withToolResult(() => request("confluence", "POST", "api/content", {
    body: {
      type: "page",
      title,
      space: { key: spaceKey },
      body: { storage: { value: bodyStorage, representation: "storage" } },
      ...(parentPageId ? { ancestors: [{ id: parentPageId }] } : {}),
    },
  })));

  server.registerTool("confluence_update_page", {
    title: "Update Confluence page",
    description: "Update a page's title and/or storage-format body. The server reads the current version and increments it. Set expectedVersion to prevent overwriting a page that changed since you read it.",
    inputSchema: z.object({
      contentId: z.string().min(1),
      title: z.string().min(1).optional(),
      bodyStorage: z.string().min(1).optional(),
      expectedVersion: z.number().int().positive().optional(),
      versionMessage: z.string().optional(),
    }),
    annotations: writeAnnotations,
  }, async ({ contentId, title, bodyStorage, expectedVersion, versionMessage }) => withToolResult(async () => {
    if (title === undefined && bodyStorage === undefined) {
      throw new Error("Provide a new title, bodyStorage, or both.");
    }
    const current = await request("confluence", "GET", `api/content/${contentId}`, {
      query: { expand: ["body.storage", "version", "space"] },
    }) as {
      id?: string;
      type?: string;
      title?: string;
      space?: { key?: string };
      version?: { number?: number };
      body?: { storage?: { value?: string } };
    };
    const currentVersion = current.version?.number;
    if (!current.id || currentVersion === undefined) throw new Error("Confluence did not return the current page ID and version.");
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      throw new Error(`Version conflict: expected ${expectedVersion}, current page version is ${currentVersion}. Read the page again before updating.`);
    }
    return request("confluence", "PUT", `api/content/${contentId}`, {
      body: {
        id: current.id,
        type: current.type ?? "page",
        title: title ?? current.title,
        space: current.space ? { key: current.space.key } : undefined,
        body: {
          storage: {
            value: bodyStorage ?? current.body?.storage?.value ?? "",
            representation: "storage",
          },
        },
        version: { number: currentVersion + 1, ...(versionMessage ? { message: versionMessage } : {}) },
      },
    });
  }));

  server.registerTool("confluence_delete_page", {
    title: "Delete Confluence page",
    description: "Delete or archive a Confluence content item according to the server's REST API and permissions. This is destructive.",
    inputSchema: z.object({ contentId: z.string().min(1) }),
    annotations: deleteAnnotations,
  }, async ({ contentId }) => withToolResult(() => request("confluence", "DELETE", `api/content/${contentId}`)));

  server.registerTool("confluence_list_comments", {
    title: "List Confluence page comments",
    description: "List comments on a content item. Use start and limit for pagination.",
    inputSchema: z.object({ contentId: z.string().min(1), start: pageNumber, limit: pageSize, expand: z.array(z.string()).optional() }),
    annotations: readAnnotations,
  }, async ({ contentId, start, limit, expand }) => withToolResult(() => request("confluence", "GET", `api/content/${contentId}/child/comment`, {
    query: { start, limit, ...(expand ? { expand } : {}) },
  })));

  server.registerTool("confluence_add_comment", {
    title: "Add Confluence page comment",
    description: "Add a comment to a Confluence content item as the authenticated user.",
    inputSchema: z.object({ contentId: z.string().min(1), bodyStorage: z.string().min(1) }),
    annotations: writeAnnotations,
  }, async ({ contentId, bodyStorage }) => withToolResult(() => request("confluence", "POST", "api/content", {
    body: {
      type: "comment",
      container: { id: contentId },
      body: { storage: { value: bodyStorage, representation: "storage" } },
    },
  })));

  server.registerTool("confluence_list_attachments", {
    title: "List Confluence attachments",
    description: "List attachments on a Confluence content item. Use start and limit for pagination.",
    inputSchema: z.object({ contentId: z.string().min(1), start: pageNumber, limit: pageSize, expand: z.array(z.string()).optional() }),
    annotations: readAnnotations,
  }, async ({ contentId, start, limit, expand }) => withToolResult(() => request("confluence", "GET", `api/content/${contentId}/child/attachment`, {
    query: { start, limit, ...(expand ? { expand } : {}) },
  })));

  server.registerTool("confluence_rest", {
    title: "Call Confluence REST API",
    description: "Call any JSON Confluence Server/Data Center REST endpoint on the configured Confluence host. apiPath is relative to /rest/, for example api/content, api/content/123/child/attachment, or api/search. Supports GET, POST, PUT, PATCH, DELETE. Never put credentials in apiPath, query, or body. Write and delete calls act as the configured user.",
    inputSchema: z.object({ method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]), apiPath: z.string().min(1), query: rawQuery, body: genericBody }),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async ({ method, apiPath, query, body }) => withToolResult(() => request("confluence", method, apiPath, {
    ...(query ? { query: query as Record<string, QueryValue> } : {}),
    ...(body === undefined ? {} : { body }),
  })));
}
