import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { STEALTH_DEFAULTS, WAIT_UNTIL_VALUES } from './constants';
import { askAboutPage } from './ops/ask';
import { fetchMarkdown } from './ops/markdown';
import { fetchScreenshot } from './ops/screenshot';
import { fetchSnapshot } from './ops/snapshot';
import { search } from './ops/search';
import { rewritePageRequest } from './rewrite';

export class WebToolsMCP extends McpAgent<Env> {
	server = new McpServer({
		name: 'webtools',
		version: '0.7.2',
		description: 'Web tools backed by a headless Chromium browser',
	});

	async init() {
		this.server.registerTool(
			'fetch',
			{
				description:
					'Fetch a URL as Markdown. Handles webpages and rich documents (PDFs, Office docs). ' +
					'Output can be very long when raw=true. ' +
					"You should ALWAYS retry `fetch` with stealth=true for anti-bot pages, waitUntil='networkidle' or 'settled' for SPAs, and raw=true for incomplete or empty pages.",
				inputSchema: {
					url: z.url(),
					stealth: z.boolean().default(false).describe('Route through a stealth browser instead of Cloudflare Browser Run.'),
					raw: z.boolean().default(false).describe('Skip Defuddle and return the raw page conversion.'),
					waitUntil: z
						.enum(WAIT_UNTIL_VALUES)
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
					'Run `snapshot` but only returns the screenshot. ' +
					'Use only when you want visual identity alone; ' +
					'if you also care about the content, use `snapshot`.',
				inputSchema: { url: z.url() },
			},
			async ({ url }) => {
				const request = rewritePageRequest({ url, ...STEALTH_DEFAULTS });
				const png = await fetchScreenshot({ env: this.env }, request);
				const data = Buffer.from(png).toString('base64');
				return { content: [{ type: 'image', data, mimeType: 'image/png' }] };
			},
		);

		this.server.registerTool(
			'snapshot',
			{
				description:
					'Run `fetch(stealth=true, waitUntil=settled, raw=true)` and take a full-page PNG screenshot of a webpage.' +
					' Returns both fetch result and screenshot.',
				inputSchema: { url: z.url() },
			},
			async ({ url }) => {
				const request = rewritePageRequest({ url, ...STEALTH_DEFAULTS });
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
					'Run `fetch(stealth=true, waitUntil=settled, raw=true)` on the URL under the hood, then have an LLM respond to your prompt about its content. ' +
					'Slow due to the LLM round trip. ' +
					'Use when you want a focused answer.',
				inputSchema: {
					url: z.url(),
					prompt: z.string(),
				},
			},
			async ({ url, prompt }) => {
				const request = rewritePageRequest({ url, ...STEALTH_DEFAULTS });
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
				const results = await search({ env: this.env }, query);
				return {
					content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
					structuredContent: { results },
				};
			},
		);
	}
}
