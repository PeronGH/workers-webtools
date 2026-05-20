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
		version: '0.7.0',
		description: 'Web tools backed by a headless Chromium browser',
	});

	async init() {
		this.server.registerTool(
			'fetch',
			{
				description:
					'Fetch a URL as Markdown. Handles webpages and rich documents (PDFs, Office docs). ' +
					'Output can be very long. ' +
					"You should ALWAYS retry with stealth=true for anti-bot pages, waitUntil='networkidle' or 'settled' for SPAs, and raw=true for incomplete or empty pages.",
				inputSchema: {
					url: z.url(),
					stealth: z.boolean().default(false).describe('Route through a stealth browser instead of Cloudflare Browser Run.'),
					raw: z.boolean().default(false).describe('Skip Defuddle and return the raw page conversion.'),
					waitUntil: z
						.enum(['domcontentloaded', 'networkidle', 'settled'])
						.default('domcontentloaded')
						.describe("Navigation wait strategy. 'settled' waits for networkidle then sleeps 5s for stubborn SPAs."),
				},
			},
			async ({ url, stealth, raw, waitUntil }) => {
				const request = rewritePageRequest({ url, stealth, raw, waitUntil });
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
				const request = rewritePageRequest({ url, stealth: true, raw: true, waitUntil: 'networkidle' });
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
				const request = rewritePageRequest({ url, stealth: true, raw: true, waitUntil: 'networkidle' });
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
				const request = rewritePageRequest({ url, stealth: true, raw: true, waitUntil: 'networkidle' });
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
