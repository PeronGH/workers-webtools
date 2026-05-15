import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { fetchMarkdown } from './fetchMarkdown';
import { fetchScreenshot } from './fetchScreenshot';
import { WebToolsMCP } from './mcp';

export { WebToolsMCP };

const app = new Hono<{ Bindings: Env }>();

app.all('/mcp', (c) => WebToolsMCP.serve('/mcp').fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext<unknown>));

function extractTarget(c: { req: { url: string } }, prefix: string): string {
	const target = c.req.url.slice(c.req.url.indexOf(prefix) + prefix.length);
	if (!/^https?:\/\//i.test(target)) {
		throw new HTTPException(400, { message: 'Target URL must start with http:// or https://' });
	}
	return target;
}

app.get('/fetch/*', async (c) => {
	const target = extractTarget(c, '/fetch/');
	const markdown = await fetchMarkdown(target, c.env);
	return c.body(markdown, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

app.get('/screenshot/*', async (c) => {
	const target = extractTarget(c, '/screenshot/');
	const png = await fetchScreenshot(target, c.env);
	return c.body(png, 200, { 'Content-Type': 'image/png' });
});

export default app;
