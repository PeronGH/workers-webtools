import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { z } from 'zod';
import { fetchMarkdown } from './fetchMarkdown';

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
	}
}
