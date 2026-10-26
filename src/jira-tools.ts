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

export function registerJiraTools(server: McpServer): void {
  server.registerTool("jira_get_current_user", {
    title: "Get Jira current user",
    description: "Return the authenticated Jira user. The Jira server and personal access token are read from this MCP process's private environment.",
    inputSchema: z.object({}),
    annotations: readAnnotations,
  }, async () => withToolResult(() => request("jira", "GET", "api/2/myself")));

  server.registerTool("jira_search_issues", {
    title: "Search Jira issues",
    description: "Search issues using Jira Query Language (JQL). Use startAt and maxResults for pagination; fields can restrict returned data.",
    inputSchema: z.object({
      jql: z.string().min(1),
      startAt: pageNumber,
      maxResults: pageSize,
      fields,
      expand: z.array(z.string()).optional(),
    }),
    annotations: readAnnotations,
  }, async ({ jql, startAt, maxResults, fields: requestedFields, expand }) => withToolResult(() => request("jira", "GET", "api/2/search", {
    query: {
      jql,
      startAt,
      maxResults,
      ...(requestedFields ? { fields: requestedFields } : {}),
      ...(expand ? { expand } : {}),
    },
  })));

  server.registerTool("jira_get_issue", {
    title: "Get Jira issue",
    description: "Read one issue by key or numeric ID.",
    inputSchema: z.object({ issueKey: z.string().min(1), fields, expand: z.array(z.string()).optional() }),
    annotations: readAnnotations,
  }, async ({ issueKey, fields: requestedFields, expand }) => withToolResult(() => request("jira", "GET", `api/2/issue/${issueKey}`, {
    query: { ...(requestedFields ? { fields: requestedFields } : {}), ...(expand ? { expand } : {}) },
  })));

  server.registerTool("jira_create_issue", {
    title: "Create Jira issue",
    description: "Create an issue. Provide Jira's fields object, including project, issuetype, and summary as required by your configuration.",
    inputSchema: z.object({ fields: z.record(z.string(), z.unknown()) }),
    annotations: writeAnnotations,
  }, async ({ fields: issueFields }) => withToolResult(() => request("jira", "POST", "api/2/issue", { body: { fields: issueFields } })));

  server.registerTool("jira_update_issue", {
    title: "Update Jira issue",
    description: "Update an issue's fields. Jira applies the authenticated user's permissions and workflow rules.",
    inputSchema: z.object({ issueKey: z.string().min(1), fields: z.record(z.string(), z.unknown()), notifyUsers: z.boolean().optional() }),
    annotations: writeAnnotations,
  }, async ({ issueKey, fields: issueFields, notifyUsers }) => withToolResult(() => request("jira", "PUT", `api/2/issue/${issueKey}`, {
    ...(notifyUsers === undefined ? {} : { query: { notifyUsers } }),
    body: { fields: issueFields },
  })));

  server.registerTool("jira_delete_issue", {
    title: "Delete Jira issue",
    description: "Permanently delete an issue. This is destructive and depends on the user's Jira permissions.",
    inputSchema: z.object({ issueKey: z.string().min(1), deleteSubtasks: z.boolean().default(false) }),
    annotations: deleteAnnotations,
  }, async ({ issueKey, deleteSubtasks }) => withToolResult(() => request("jira", "DELETE", `api/2/issue/${issueKey}`, { query: { deleteSubtasks } })));

  server.registerTool("jira_list_projects", {
    title: "List Jira projects",
    description: "List visible Jira projects with pagination.",
    inputSchema: z.object({ startAt: pageNumber, maxResults: pageSize, query: z.string().optional() }),
    annotations: readAnnotations,
  }, async ({ startAt, maxResults, query }) => withToolResult(() => request("jira", "GET", "api/2/project/search", {
    query: { startAt, maxResults, ...(query ? { query } : {}) },
  })));

  server.registerTool("jira_add_comment", {
    title: "Add Jira issue comment",
    description: "Add a comment to an issue as the authenticated Jira user.",
    inputSchema: z.object({ issueKey: z.string().min(1), body: z.string().min(1) }),
    annotations: writeAnnotations,
  }, async ({ issueKey, body }) => withToolResult(() => request("jira", "POST", `api/2/issue/${issueKey}/comment`, { body: { body } })));

  server.registerTool("jira_list_comments", {
    title: "List Jira issue comments",
    description: "List comments visible to the authenticated Jira user.",
    inputSchema: z.object({ issueKey: z.string().min(1), startAt: pageNumber, maxResults: pageSize }),
    annotations: readAnnotations,
  }, async ({ issueKey, startAt, maxResults }) => withToolResult(() => request("jira", "GET", `api/2/issue/${issueKey}/comment`, { query: { startAt, maxResults } })));

  server.registerTool("jira_list_transitions", {
    title: "List Jira issue transitions",
    description: "Return workflow transitions currently available for an issue.",
    inputSchema: z.object({ issueKey: z.string().min(1) }),
    annotations: readAnnotations,
  }, async ({ issueKey }) => withToolResult(() => request("jira", "GET", `api/2/issue/${issueKey}/transitions`)));

  server.registerTool("jira_transition_issue", {
    title: "Transition Jira issue",
    description: "Move an issue through a currently available workflow transition. Call jira_list_transitions first to find a valid transition ID.",
    inputSchema: z.object({ issueKey: z.string().min(1), transitionId: z.string().min(1), fields: z.record(z.string(), z.unknown()).optional(), comment: z.string().optional() }),
    annotations: writeAnnotations,
  }, async ({ issueKey, transitionId, fields: transitionFields, comment }) => withToolResult(() => request("jira", "POST", `api/2/issue/${issueKey}/transitions`, {
    body: {
      transition: { id: transitionId },
      ...(transitionFields ? { fields: transitionFields } : {}),
      ...(comment ? { update: { comment: [{ add: { body: comment } }] } } : {}),
    },
  })));

  server.registerTool("jira_add_worklog", {
    title: "Add Jira worklog",
    description: "Record work against an issue. Use Jira's duration syntax for timeSpent and an ISO date-time for started.",
    inputSchema: z.object({ issueKey: z.string().min(1), timeSpent: z.string().min(1), started: z.string().min(1), comment: z.string().optional() }),
    annotations: writeAnnotations,
  }, async ({ issueKey, timeSpent, started, comment }) => withToolResult(() => request("jira", "POST", `api/2/issue/${issueKey}/worklog`, {
    body: { timeSpent, started, ...(comment ? { comment } : {}) },
  })));

  server.registerTool("jira_list_boards", {
    title: "List Jira Agile boards",
    description: "List visible Jira Software boards. Jira Software must be installed for this endpoint.",
    inputSchema: z.object({ startAt: pageNumber, maxResults: pageSize, name: z.string().optional(), projectKeyOrId: z.string().optional() }),
    annotations: readAnnotations,
  }, async ({ startAt, maxResults, name, projectKeyOrId }) => withToolResult(() => request("jira", "GET", "agile/1.0/board", {
    query: { startAt, maxResults, ...(name ? { name } : {}), ...(projectKeyOrId ? { projectKeyOrId } : {}) },
  })));

  server.registerTool("jira_list_sprints", {
    title: "List Jira board sprints",
    description: "List sprints for a Jira Software board. Optionally filter by active, future, or closed state.",
    inputSchema: z.object({ boardId: z.number().int().positive(), startAt: pageNumber, maxResults: pageSize, state: z.enum(["active", "future", "closed"]).optional() }),
    annotations: readAnnotations,
  }, async ({ boardId, startAt, maxResults, state }) => withToolResult(() => request("jira", "GET", `agile/1.0/board/${boardId}/sprint`, {
    query: { startAt, maxResults, ...(state ? { state } : {}) },
  })));

  server.registerTool("jira_add_issue_link", {
    title: "Link Jira issues",
    description: "Create an issue link. Use an issue-link type name available in your Jira instance, such as Blocks or Relates.",
    inputSchema: z.object({ typeName: z.string().min(1), inwardIssueKey: z.string().min(1), outwardIssueKey: z.string().min(1), comment: z.string().optional() }),
    annotations: writeAnnotations,
  }, async ({ typeName, inwardIssueKey, outwardIssueKey, comment }) => withToolResult(() => request("jira", "POST", "api/2/issueLink", {
    body: {
      type: { name: typeName },
      inwardIssue: { key: inwardIssueKey },
      outwardIssue: { key: outwardIssueKey },
      ...(comment ? { comment: { body: comment } } : {}),
    },
  })));

  server.registerTool("jira_rest", {
    title: "Call Jira REST API",
    description: "Call any JSON Jira Data Center REST endpoint on the configured Jira host. apiPath is relative to /rest/, for example api/2/issue/ABC-1, agile/1.0/board, or servicedeskapi/request. Supports GET, POST, PUT, PATCH, DELETE. Never put credentials in apiPath, query, or body. Write and delete calls act as the configured user.",
    inputSchema: z.object({ method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]), apiPath: z.string().min(1), query: rawQuery, body: genericBody }),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async ({ method, apiPath, query, body }) => withToolResult(() => request("jira", method, apiPath, {
    ...(query ? { query: query as Record<string, QueryValue> } : {}),
    ...(body === undefined ? {} : { body }),
  })));
}
