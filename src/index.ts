import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { fetchContent } from './fetch';
import { formatSearchResults, MAX_PAGES, search } from './search';

function createServer() {
	const server = new McpServer(
		{ name: 'webtools', version: '1.0.0' },
		{
			instructions: [
				'Use web_search to check anything that may be outdated or uncertain, then read the promising results with web_fetch.',
				'Use web_fetch instead of curl to read web pages, images, and PDFs, because it returns web pages and PDFs as readable Markdown and images as images.',
			].join('\n'),
		},
	);

	server.registerTool(
		'web_search',
		{
			title: 'Web Search',
			description: 'Search the web. Returns a numbered Markdown list of results with title, URL, and snippet.',
			inputSchema: {
				query: z.string().describe('The search query'),
				pages: z
					.number()
					.int()
					.min(1)
					.max(MAX_PAGES)
					.default(1)
					.describe('Pages of 20 results to return, defaults to 1; 6 returns all 120'),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ query, pages }, ctx) => {
			const results = await search(query, pages, ctx.mcpReq.signal);
			const text = results.length === 0 ? `No results found for: ${query}` : formatSearchResults(results);
			return { content: [{ type: 'text', text }] };
		},
	);

	server.registerTool(
		'web_fetch',
		{
			title: 'Web Fetch',
			description:
				'Fetch a URL and return its content: web pages and PDFs as Markdown, other text as is, and images as images. Links within the same site are root-relative (/path); resolve them against the fetched URL. Pages that render their content with JavaScript come back empty from a direct fetch; retry those with render: true.',
			inputSchema: {
				url: z.string().describe('The URL to fetch'),
				render: z.boolean().default(false).describe('Render the page in a headless browser (slow)'),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ url, render }, ctx) => {
			const page = await fetchContent(url, render, ctx.mcpReq.signal);
			if (page.type === 'image') {
				const data = Buffer.from(page.data).toString('base64');
				return { content: [{ type: 'image', data, mimeType: page.mimeType }] };
			}
			return { content: [{ type: 'text', text: page.text }] };
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
