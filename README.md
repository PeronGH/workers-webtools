# webtools

A stateless [MCP](https://modelcontextprotocol.io/) server on Cloudflare Workers that lets agents search and fetch the web. The tools come from [`@peron_js/web-cli`](https://www.npmjs.com/package/@peron_js/web-cli).

| Tool | Parameters | Returns |
|------|------------|---------|
| `web_search` | `query`, `limit` (default 20, max 120) | Numbered Markdown list of results with title, URL, and snippet |
| `web_fetch` | `url`, `render` (headless browser), `raw` (whole page) | Page content as Markdown |

The endpoint has no authentication.

## Usage

```bash
bun install
bunx wrangler dev      # http://localhost:8787/mcp
bunx wrangler deploy   # https://webtools.<your-subdomain>.workers.dev/mcp
```

Point any Streamable HTTP MCP client at the `/mcp` URL, for example:

```json
{
	"mcpServers": {
		"webtools": { "url": "https://webtools.<your-subdomain>.workers.dev/mcp" }
	}
}
```
