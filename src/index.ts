import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { askAboutContent } from './askAboutContent';
import { fetchMarkdown } from './fetchMarkdown';
import { fetchScreenshot } from './fetchScreenshot';
import { WebToolsMCP } from './mcp';
import { search } from './search';

export { WebToolsMCP };

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
	const provided =
		c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? new URL(c.req.url).searchParams.get('key');
	if (provided !== c.env.API_KEY) {
		throw new HTTPException(401, { message: 'Unauthorized' });
	}
	await next();
});

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

app.post('/ask/*', async (c) => {
	const target = extractTarget(c, '/ask/');
	const prompt = await c.req.text();
	const markdown = await fetchMarkdown(target, c.env);
	const answer = await askAboutContent(markdown, target, prompt, c.env);
	return c.body(answer, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

app.get('/screenshot/*', async (c) => {
	const target = extractTarget(c, '/screenshot/');
	const png = await fetchScreenshot(target, c.env);
	return c.body(png as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': 'image/png' });
});

app.get('/search', async (c) => {
	const query = c.req.query('q');
	if (!query) {
		throw new HTTPException(400, { message: 'q query param is required' });
	}
	const page = Number(c.req.query('page') ?? '1');
	const results = await search(query, page, c.env);
	return c.json(results);
});

export default app;
