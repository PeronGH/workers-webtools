import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { fetchMarkdown } from './fetchMarkdown';
import { fetchScreenshot } from './fetchScreenshot';

export class WebToolsMCP extends McpAgent<Env> {
	server = new McpServer({ name: 'webtools', version: '0.1.0' });

	async init() {
		this.server.registerTool(
			'fetch',
			{
				description: 'Fetch a webpage and return its rendered Markdown.',
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
	}
}
