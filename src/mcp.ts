import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { askAboutPage } from './ops/ask';
import { fetchMarkdown } from './ops/markdown';
import { fetchScreenshot } from './ops/screenshot';
import { fetchSnapshot } from './ops/snapshot';
import { search } from './ops/search';
import { rewritePageRequest } from './rewrite';

export class WebToolsMCP extends McpAgent<Env> {
	server = new McpServer({
		name: 'webtools',
		version: '0.6.0',
		description: 'Web tools backed by a headless Chromium browser',
	});

	async init() {
		this.server.registerTool(
			'fetch',
			{
				description:
					'Fetch a URL as Markdown. Handles webpages, images, and rich documents (PDFs, Office docs). ' +
					'Output can be very long. ' +
					'You should ALWAYS retry with fast=false for SPA or anti-bot pages, and with full=false for incomplete or empty pages.',
				inputSchema: {
					url: z.url(),
					fast: z.boolean().default(true).describe('Initial HTML only. Disable for SPAs or anti-bot pages.'),
					full: z.boolean().default(false).describe('Skip Defuddle content trimming and return the raw page conversion.'),
				},
			},
			async ({ url, fast, full }) => {
				const request = rewritePageRequest({ url, fast, full });
				const markdown = await fetchMarkdown({ env: this.env }, request);
				return { content: [{ type: 'text', text: markdown }] };
			},
		);

		this.server.registerTool(
			'screenshot',
			{
				description:
					'Take a full-page PNG screenshot of a webpage. ' +
					'Use only when you want visual identity alone; ' +
					'if you also care about the content, use `snapshot`.',
				inputSchema: { url: z.url() },
			},
			async ({ url }) => {
				const request = rewritePageRequest({ url });
				const png = await fetchScreenshot({ env: this.env }, request);
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
				const request = rewritePageRequest({ url });
				const { markdown, png } = await fetchSnapshot({ env: this.env }, request);
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
				description:
					'Run `fetch` on the URL under the hood, then have an LLM respond to your prompt about its content. ' +
					'Slow due to the LLM round trip; ' +
					'use when you want a focused answer instead of the raw page Markdown.',
				inputSchema: {
					url: z.url(),
					prompt: z.string(),
				},
			},
			async ({ url, prompt }) => {
				const request = rewritePageRequest({ url });
				const answer = await askAboutPage({ env: this.env }, request, prompt);
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
				const results = await search(query, { env: this.env });
				return {
					content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
					structuredContent: { results },
				};
			},
		);
	}
}
