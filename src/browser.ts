import { Container, getContainer } from '@cloudflare/containers';
import { launch, type BrowserWorker } from '@cloudflare/playwright';

export type Browser = Awaited<ReturnType<typeof launch>>;
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>;
export type Page = Awaited<ReturnType<BrowserContext['newPage']>>;

export const TIMEOUT = 10000;

/** Worker-runtime context. When `ctx` is provided, browser.close() is detached
 *  via ctx.waitUntil so the caller returns as soon as the action's result is ready.
 *  `rayId` keys the per-request container instance — same value lands in the
 *  Worker log RayID for trivial correlation. */
export type WorkerCtx = { env: Env; ctx?: ExecutionContext; rayId?: string };

/** Per-call rendering options. */
export type PageRequest = { url: string; renderMode?: 'spa' | 'ssr' };

/** Container hosting one Rayobrowse instance (one Chrome). The DO class is
 *  bound to the RAYO namespace; concurrent requests pick distinct instances by
 *  passing a unique name to getContainer. */
export class RayoBrowser extends Container {
	defaultPort = 9222;
	sleepAfter = '60s';
}

/** Adapter from @cloudflare/playwright's BrowserWorker contract to Rayobrowse's API.
 *  launch() only calls /v1/acquire (returns { sessionId }) and
 *  /v1/devtools/browser/<id> with Upgrade: websocket. We translate:
 *    /v1/acquire  → GET /connect (returns ws://host:9222/devtools/browser/<uuid>)
 *    /v1/devtools/browser/<id>  → ws://rayo/devtools/browser/<id> */
function rayoAdapter(env: Env, instanceId: string): BrowserWorker {
	const rayo = getContainer(env.RAYO, instanceId);
	return {
		async fetch(input) {
			const url = new URL(input instanceof Request ? input.url : input);
			if (url.pathname === '/v1/acquire') {
				const r = await rayo.fetch('http://rayo/connect');
				if (!r.ok) throw new Error(`Rayobrowse /connect ${r.status}: ${await r.text()}`);
				const sessionId = new URL((await r.text()).trim()).pathname.split('/').pop() ?? '';
				return Response.json({ sessionId });
			}
			if (url.pathname.startsWith('/v1/devtools/browser/')) {
				const id = url.pathname.slice('/v1/devtools/browser/'.length);
				return rayo.fetch(new Request(`http://rayo/devtools/browser/${id}`, { headers: { Upgrade: 'websocket' } }));
			}
			return new Response('not implemented', { status: 404 });
		},
	};
}

export async function withBrowser<T>({ env, ctx, rayId }: WorkerCtx, action: (browser: Browser) => Promise<T>): Promise<T> {
	const browser = await launch(rayoAdapter(env, rayId ?? crypto.randomUUID()));
	try {
		return await action(browser);
	} finally {
		if (ctx) ctx.waitUntil(browser.close());
		else await browser.close();
	}
}
