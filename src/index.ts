import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Buffer } from 'node:buffer';
import { fetchMarkdown } from './fetchMarkdown';
import { fetchSnapshot } from './fetchSnapshot';
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

app.get('/snapshot/*', async (c) => {
	const target = extractTarget(c, '/snapshot/');
	const base64 = await fetchSnapshot(target, c.env);
	return c.body(Buffer.from(base64, 'base64'), 200, { 'Content-Type': 'image/png' });
});

export default app;
