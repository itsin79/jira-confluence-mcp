#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { registerConfluenceTools } from "./confluence-tools.js";
import { registerJiraTools } from "./jira-tools.js";

function createServer(): McpServer {
  const server = new McpServer(
    { name: "jira-confluence-mcp", version: "0.1.0" },
    {
      instructions: [
        "This MCP server connects to self-hosted Jira and Confluence Server/Data Center instances.",
        "The base URL and personal access token for each product come from this process's private environment variables.",
        "Do not request, reveal, or put personal access tokens in tool arguments. Never infer a user has permission because a tool exists; the Atlassian server applies the account's own permissions.",
        "Use read tools before writes when needed. Confirm the intended target before destructive operations.",
        "For product/version-specific endpoints not covered by a convenience tool, use jira_rest or confluence_rest with a path relative to /rest/.",
      ].join(" "),
    },
  );

  registerJiraTools(server);
  registerConfluenceTools(server);
  return server;
}

const handle = serveStdio(createServer);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void handle.close().finally(() => process.exit(0));
  });
}
