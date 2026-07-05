import { getContainer } from '@cloudflare/containers';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { STEALTH_DEFAULTS, WAIT_UNTIL_VALUES } from './constants';
import { WebToolsMCP } from './mcp';
import { askAboutPage } from './ops/ask';
import { fetchMarkdown } from './ops/markdown';
import { fetchScreenshot } from './ops/screenshot';
import { search } from './ops/search';
import { CloakBrowser } from './render/container';
import { rewritePageRequest } from './rewrite';
import type { WaitUntil } from './types';

function parseWaitUntil(header: string | undefined): WaitUntil {
	const v = header?.trim() as WaitUntil | undefined;
	return v && WAIT_UNTIL_VALUES.includes(v) ? v : 'domcontentloaded';
}

export { CloakBrowser, WebToolsMCP };

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
	const provided = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? new URL(c.req.url).searchParams.get('key');
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
	const request = rewritePageRequest({
		url: target,
		stealth: c.req.header('x-stealth')?.trim() === '1',
		raw: c.req.header('x-raw')?.trim() === '1',
		waitUntil: parseWaitUntil(c.req.header('x-wait-until')),
	});
	const worker = { env: c.env, ctx: c.executionCtx as ExecutionContext };
	const markdown = await fetchMarkdown(worker, request);
	return c.body(markdown, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

app.post('/ask/*', async (c) => {
	const target = extractTarget(c, '/ask/');
	const prompt = await c.req.text();
	const request = rewritePageRequest({ url: target, ...STEALTH_DEFAULTS });
	const worker = { env: c.env, ctx: c.executionCtx as ExecutionContext };
	const answer = await askAboutPage(worker, request, prompt);
	return c.body(answer, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
});

app.get('/screenshot/*', async (c) => {
	const target = extractTarget(c, '/screenshot/');
	const request = rewritePageRequest({ url: target, ...STEALTH_DEFAULTS });
	const worker = { env: c.env, ctx: c.executionCtx as ExecutionContext };
	const png = await fetchScreenshot(worker, request);
	return c.body(png as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': 'image/png' });
});

app.get('/search', async (c) => {
	const query = c.req.query('q');
	if (!query) {
		throw new HTTPException(400, { message: 'q query param is required' });
	}
	const results = await search(query);
	return c.json(results);
});

app.all('/raw/*', async (c) => {
	const incoming = c.req.raw;
	const inUrl = new URL(incoming.url);
	const target = `http://cloak${inUrl.pathname.slice('/raw'.length)}${inUrl.search}`;
	return getContainer(c.env.CLOAK).fetch(new Request(target, incoming));
});

app.post('/restart', async (c) => {
	await getContainer(c.env.CLOAK).destroy();
	return c.body(null, 204);
});

export default app;
