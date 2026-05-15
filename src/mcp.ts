import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { askAboutContent } from './askAboutContent';
import { fetchMarkdown } from './fetchMarkdown';
import { fetchScreenshot } from './fetchScreenshot';

export class WebToolsMCP extends McpAgent<Env> {
	server = new McpServer({ name: 'webtools', version: '0.1.0' });

	async init() {
		this.server.registerTool(
			'fetch',
			{
				description:
					'Fetch a webpage and return its rendered Markdown. ' +
					'Output can be very long — prefer `ask` for specific questions; use `fetch` only when you actually need the full content.',
				inputSchema: { url: z.string().url() },
			},
			async ({ url }) => {
				const markdown = await fetchMarkdown(url, this.env);
				return { content: [{ type: 'text', text: markdown }] };
			},
		);

		this.server.registerTool(
			'screenshot',
			{
				description: 'Take a PNG screenshot of a webpage.',
				inputSchema: { url: z.string().url() },
			},
			async ({ url }) => {
				const png = await fetchScreenshot(url, this.env);
				const data = Buffer.from(png).toString('base64');
				return { content: [{ type: 'image', data, mimeType: 'image/png' }] };
			},
		);

		this.server.registerTool(
			'ask',
			{
				description: "Ask a question about a webpage's content.",
				inputSchema: { url: z.string().url(), prompt: z.string() },
			},
			async ({ url, prompt }) => {
				const markdown = await fetchMarkdown(url, this.env);
				const answer = await askAboutContent(markdown, url, prompt, this.env);
				return { content: [{ type: 'text', text: answer }] };
			},
		);
	}
}
