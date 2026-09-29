import { McpServer } from "@modelcontextprotocol/server";
import {
	type ConvertContext,
	fetchContent,
	formatSearchResults,
	type HtmlToMarkdown,
	type PdfToMarkdown,
	search,
} from "@peron_js/web-cli";
import { createFetcher } from "@pixel/socket-fetch";
import { createMcpHandler } from "agents/mcp/server";
import { connect } from "cloudflare:sockets";
import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
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

async function aiToMarkdown(
	document: MarkdownDocument,
	{ url }: ConvertContext,
	conversionOptions?: ConversionOptions,
): Promise<string> {
	const result = await env.AI.toMarkdown(document, { conversionOptions });
	if (result.format === "error") throw new Error(`Cannot convert ${url}: ${result.error}`);
	return result.data;
}

const htmlToMarkdown: HtmlToMarkdown = (html, context) =>
	aiToMarkdown({ name: "page.html", blob: new Blob([html], { type: "text/html" }) }, context, {
		html: { hostname: context.url },
	});

const pdfToMarkdown: PdfToMarkdown = (pdf, context) =>
	aiToMarkdown(
		{ name: "document.pdf", blob: new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }) },
		context,
	);

function createServer() {
	const server = new McpServer(
		{ name: "webtools", version: "1.0.0" },
		{
			instructions: [
				"Use web_search to check anything that may be outdated or uncertain, then read the promising results with web_fetch.",
				"Use web_fetch instead of curl to read web pages, images, and PDFs, because it returns web pages and PDFs as readable Markdown and images as images.",
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
				"Fetch a URL and return its content: web pages and PDFs as Markdown, other text as is, and images as images. Pages that render their content with JavaScript come back empty from a direct fetch; retry those with render: true.",
			inputSchema: {
				url: z.string().describe("The URL to fetch"),
				render: z.boolean().optional().describe("Render the page in a headless browser (slow)"),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ url, render }, ctx) => {
			const page = await fetchContent(
				url,
				{ render },
				{ fetch: directFetch, signal: ctx.mcpReq.signal, htmlToMarkdown, pdfToMarkdown },
			);
			if (page.type === "image") {
				const data = Buffer.from(page.data).toString("base64");
				return { content: [{ type: "image", data, mimeType: page.mimeType }] };
			}
			return { content: [{ type: "text", text: page.text }] };
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
