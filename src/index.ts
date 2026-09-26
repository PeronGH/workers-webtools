import { McpServer } from "@modelcontextprotocol/server";
import { fetchAsMarkdown, formatSearchResults, search } from "@peron_js/web-cli";
import { createFetcher } from "@pixel/socket-fetch";
import { createMcpHandler } from "agents/mcp/server";
import { connect } from "cloudflare:sockets";
import { z } from "zod";

const socketFetch = createFetcher({
	connect,
	connectTls: (address) => connect(address, { secureTransport: "on", allowHalfOpen: false }),
});

const directFetch: typeof fetch = async (input, init) => {
	try {
		return await socketFetch(input, init);
	} catch {
		return fetch(input, init);
	}
};

function createServer() {
	const server = new McpServer(
		{ name: "webtools", version: "1.0.0" },
		{
			instructions: [
				"Use web_search to check anything that may be outdated or uncertain, then read the promising results with web_fetch.",
				"Use web_fetch instead of curl to read a web page, because it returns readable Markdown instead of raw HTML.",
			].join("\n"),
		},
	);

	server.registerTool(
		"web_search",
		{
			title: "Web Search",
			description: "Search the web. Returns a numbered Markdown list of results with title, URL, and snippet.",
			inputSchema: {
				query: z.string().describe("The search query"),
				pages: z
					.number()
					.int()
					.min(1)
					.max(6)
					.default(1)
					.describe("Pages of 20 results to return, defaults to 1; 6 returns all 120"),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ query, pages }, ctx) => {
			const results = await search(query, { pages }, { fetch: directFetch, signal: ctx.mcpReq.signal });
			const text = results.length === 0 ? `No results found for: ${query}` : formatSearchResults(results);
			return { content: [{ type: "text", text }] };
		},
	);

	server.registerTool(
		"web_fetch",
		{
			title: "Web Fetch",
			description:
				"Fetch a URL and return its content as Markdown. Pages that render their content with JavaScript come back empty from a direct fetch; retry those with render: true.",
			inputSchema: {
				url: z.string().describe("The URL to fetch"),
				render: z.boolean().optional().describe("Render the page in a headless browser (slow)"),
				raw: z.boolean().optional().describe("Convert the whole page instead of extracting the main content"),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ url, render, raw }, ctx) => {
			const text = await fetchAsMarkdown(url, { render, raw }, { fetch: directFetch, signal: ctx.mcpReq.signal });
			return { content: [{ type: "text", text }] };
		},
	);

	return server;
}

const handler = createMcpHandler(createServer);

export default {
	fetch(request, env, ctx) {
		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
