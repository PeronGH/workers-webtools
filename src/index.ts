import { Hono } from 'hono';
import { fetchMarkdown } from './fetchMarkdown';
import { WebToolsMCP } from './mcp';

export { WebToolsMCP };

const app = new Hono<{ Bindings: Env }>();

app.all('/mcp', (c) => WebToolsMCP.serve('/mcp').fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext<unknown>));

app.get('/fetch/*', async (c) => {
	const target = c.req.url.slice(c.req.url.indexOf('/fetch/') + '/fetch/'.length);
	if (!/^https?:\/\//i.test(target)) {
		return c.text('Target URL must start with http:// or https://', 400);
	}
	const markdown = await fetchMarkdown(target, c.env);
	return c.body(markdown, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

export default app;
