# webtools

A stateless [MCP](https://modelcontextprotocol.io/) server on Cloudflare Workers that lets agents search and fetch the web.

| Tool         | Parameters                                        | Returns                                                                   |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| `web_search` | `query`, `pages` of 20 results (default 1, max 6) | Numbered Markdown list of results with title, URL, and snippet            |
| `web_fetch`  | `url`, `render` (headless browser)                | Web pages and PDFs as Markdown, other text as is, images as image content |

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
