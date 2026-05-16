import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { askAboutContent } from './askAboutContent';
import { fetchMarkdown } from './fetchMarkdown';
import { fetchScreenshot } from './fetchScreenshot';
import { fetchSnapshot } from './fetchSnapshot';
import { search } from './search';

export class WebToolsMCP extends McpAgent<Env> {
	server = new McpServer({
		name: 'webtools',
		version: '0.2.1',
		description: 'Web tools backed by a headless Chromium browser',
	});

	async init() {
		this.server.registerTool(
			'fetch',
			{
				description:
					'Fetch a webpage and return its rendered Markdown. ' +
					'Output can be very long due to navigation items; use `fetch` only when you actually need the full content. ' +
					'Cannot handle PDFs or other binary content.',
				inputSchema: { url: z.url() },
			},
			async ({ url }) => {
				const markdown = await fetchMarkdown(url, this.env);
				return { content: [{ type: 'text', text: markdown }] };
			},
		);

		this.server.registerTool(
			'screenshot',
			{
				description: 'Take a full-page PNG screenshot of a webpage. Use only when you want visual identity alone; if you also care about the content, use `snapshot`.',
				inputSchema: { url: z.url() },
			},
			async ({ url }) => {
				const png = await fetchScreenshot(url, this.env);
				const data = Buffer.from(png).toString('base64');
				return { content: [{ type: 'image', data, mimeType: 'image/png' }] };
			},
		);

		this.server.registerTool(
			'snapshot',
			{
				description: 'Fetch a webpage as Markdown and PNG screenshot together.',
				inputSchema: { url: z.url() },
			},
			async ({ url }) => {
				const { markdown, png } = await fetchSnapshot(url, this.env);
				return {
					content: [
						{ type: 'text', text: markdown },
						{ type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' },
					],
				};
			},
		);

		this.server.registerTool(
			'ask',
			{
				description: 'Run `fetch` on the URL under the hood, then have an LLM respond to your prompt about its content.',
				inputSchema: { url: z.url(), prompt: z.string() },
			},
			async ({ url, prompt }) => {
				const markdown = await fetchMarkdown(url, this.env);
				const answer = await askAboutContent(markdown, url, prompt, this.env);
				return { content: [{ type: 'text', text: answer }] };
			},
		);

		this.server.registerTool(
			'search',
			{
				description: 'Search the web via Brave Search.',
				inputSchema: { query: z.string() },
				outputSchema: {
					results: z.array(
						z.object({
							title: z.string(),
							url: z.string(),
							snippet: z.string(),
						}),
					),
				},
			},
			async ({ query }) => {
				const results = await search(query, this.env);
				return {
					content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
					structuredContent: { results },
				};
			},
		);
	}
}
