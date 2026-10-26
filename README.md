# Jira + Confluence MCP

An MCP server for self-hosted Atlassian Jira and Confluence Server/Data Center. Each person configures their own internal instance URL and personal access token. The repository contains no company-specific URL or credential.

## What it supports

Convenience tools cover common read/write workflows:

- Jira: current user, JQL issue search, get/create/update/delete issues, projects, comments, workflow transitions, worklogs, Agile boards and sprints, and issue links.
- Confluence: current user, CQL search, spaces, get/create/update/delete pages, comments, and attachment listing.
- `jira_rest` and `confluence_rest` expose JSON REST endpoints for additional Server/Data Center features, including Jira Service Management and installed REST plugins. Paths are restricted to the configured product host and its `/rest/` tree.

The user's Jira/Confluence permissions still govern every operation. The generic REST tools can perform writes and deletes; use them carefully. This project targets Server/Data Center, not Atlassian Cloud.

## How it works

This MCP server connects to Jira and Confluence through their REST APIs; it does not connect to either product's database. The flow is:

1. An MCP client (for example, an AI assistant) starts this server over the local stdio transport.
2. The client calls a named tool, such as `jira_search_issues` or `confluence_get_page`.
3. The server sends the matching REST API request to the configured internal Jira or Confluence URL, authenticating with that user's personal access token.
4. Jira or Confluence checks the user's permissions, performs the requested read or write, and returns a response through the MCP server to the client.

For write tools, the change is made in Jira or Confluence itself and remains subject to the configured user's permissions. The MCP process must run on a machine that can reach the company's internal hosts, such as a workstation connected to the company network or VPN.

## Requirements

- Node.js 20 or newer
- Jira Core/Software 8.14+ for personal access tokens
- Confluence 7.9+ for personal access tokens
- Network access from the MCP host to the company's Jira and Confluence hosts

Atlassian Server/Data Center personal access tokens are sent as `Authorization: Bearer …`. Tokens belong in the MCP client's private environment configuration, never in this repository, tool arguments, logs, or committed `.env` files.

## Configure

1. Create one personal access token in Jira and one in Confluence. Give each account only the permissions it needs. The products can use the same token only if your installation explicitly supports that token for both.
2. Copy `.env.example` to a private location or place the values directly in your MCP client's server configuration. Do not commit real values.
3. Set each product's base URL. A context path is allowed and must be included, e.g. `https://jira.sitename.ir/jira` or `https://wiki.sitename.ir/confluence`. The two products may also be on the same domain.

Example environment:

```dotenv
JIRA_BASE_URL=https://jira.sitename.ir
JIRA_PERSONAL_ACCESS_TOKEN=your-own-jira-token
CONFLUENCE_BASE_URL=https://confluence.sitename.ir
CONFLUENCE_PERSONAL_ACCESS_TOKEN=your-own-confluence-token
MCP_ALLOW_INSECURE_HTTP=false
```

Use HTTPS. If an internal server uses a private CA, configure Node with `NODE_EXTRA_CA_CERTS=/path/to/company-ca.pem`; TLS verification remains enabled. Set `MCP_ALLOW_INSECURE_HTTP=true` only when the internal service is intentionally HTTP-only and the network is trusted.

## Build and run

```sh
npm install
npm run build
node dist/index.js
```

For local development, `npm run dev` runs the TypeScript entry point through `tsx`.

## MCP client example

Configure the MCP host to launch the built server and inject secrets through its private environment configuration. Example shape for clients that use JSON MCP settings:

```json
{
  "mcpServers": {
    "jira-confluence": {
      "command": "node",
      "args": ["/absolute/path/to/jira-confluence-mcp/dist/index.js"],
      "env": {
        "JIRA_BASE_URL": "https://jira.sitename.ir",
        "JIRA_PERSONAL_ACCESS_TOKEN": "<enter-your-own-token-in-your-local-settings>",
        "CONFLUENCE_BASE_URL": "https://confluence.sitename.ir",
        "CONFLUENCE_PERSONAL_ACCESS_TOKEN": "<enter-your-own-token-in-your-local-settings>"
      }
    }
  }
}
```

Do not paste tokens into chat or source control. A token is only revealed once when created; revoke it in Atlassian if it is exposed.

## Tool usage notes

- Jira search uses JQL. `startAt` and `maxResults` control pagination.
- Jira writes use the Jira Server/Data Center REST API v2; Agile tools require Jira Software.
- Confluence search uses CQL. `start` and `limit` control pagination.
- Confluence page bodies use the Confluence Storage Format. Updates read the current version, increment it, and can check `expectedVersion` for conflicts.
- Generic REST paths are relative to `/rest/`. Examples: `api/2/issue/ABC-1`, `agile/1.0/board`, `servicedeskapi/request`, `api/content/123`, and `your-plugin/1.0/resource`.
- Endpoints requiring binary multipart uploads are not exposed through the JSON generic REST tools.
- Large REST responses are capped at 100,000 characters in tool output.

## Security

- No hard-coded Jira/Confluence URL, token, username, or password.
- HTTPS is required by default. HTTP requires an explicit opt-in.
- TLS certificate validation stays enabled; use the company's CA certificate with Node's `NODE_EXTRA_CA_CERTS` when needed.
- Request paths cannot select another hostname or escape the configured context path.
- Tokens are sent only in the Authorization header and are redacted from API error bodies.
- Write tools act with the configured user's permissions. Use read-only PATs unless write access is required.

## References

- [Jira Data Center REST API](https://developer.atlassian.com/server/jira/platform/rest/v10000/intro/)
- [Confluence Data Center REST API](https://developer.atlassian.com/server/confluence/rest/latest/)
- [Atlassian Data Center personal access tokens](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html)
- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/)

## License

MIT. See [LICENSE](LICENSE).
