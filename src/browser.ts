import { Container, getContainer } from '@cloudflare/containers';
import { launch, type BrowserWorker } from '@cloudflare/playwright';

export type Browser = Awaited<ReturnType<typeof launch>>;
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>;
export type Page = Awaited<ReturnType<BrowserContext['newPage']>>;

export const TIMEOUT = 10000;

/** Worker-runtime context. When `ctx` is provided, browser.close() is detached
 *  via ctx.waitUntil so the caller returns as soon as the action's result is ready.
 *  `rayId` keys the per-request Steel container instance — same value lands in the
 *  Worker log RayID for trivial correlation. */
export type WorkerCtx = { env: Env; ctx?: ExecutionContext; rayId?: string };

/** Per-call rendering options. */
export type PageRequest = { url: string; renderMode?: 'spa' | 'ssr' };

/** Container hosting one Steel Browser instance (one Chrome). The DO class is
 *  bound to the STEEL namespace; concurrent requests pick distinct instances by
 *  passing a unique name to getContainer. */
export class SteelBrowser extends Container {
	defaultPort = 3000;
	sleepAfter = '60s';
}

/** Adapter from @cloudflare/playwright's BrowserWorker contract to Steel's HTTP API.
 *  launch() only calls /v1/acquire (returns { sessionId }) and
 *  /v1/devtools/browser/<id> with Upgrade: websocket — both mapped to Steel. */
function steelAdapter(env: Env, instanceId: string): BrowserWorker {
	const steel = getContainer(env.STEEL, instanceId);
	return {
		async fetch(input) {
			const url = new URL(input instanceof Request ? input.url : input);
			if (url.pathname === '/v1/acquire') {
				const r = await steel.fetch('http://steel/v1/sessions', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: '{}',
				});
				if (!r.ok) throw new Error(`Steel /v1/sessions ${r.status}: ${await r.text()}`);
				const { id } = (await r.json()) as { id: string };
				return Response.json({ sessionId: id });
			}
			if (url.pathname.startsWith('/v1/devtools/browser/')) {
				return steel.fetch(new Request('http://steel/', { headers: { Upgrade: 'websocket' } }));
			}
			return new Response('not implemented', { status: 404 });
		},
	};
}

export async function withBrowser<T>({ env, ctx, rayId }: WorkerCtx, action: (browser: Browser) => Promise<T>): Promise<T> {
	const browser = await launch(steelAdapter(env, rayId ?? crypto.randomUUID()));
	try {
		return await action(browser);
	} finally {
		if (ctx) ctx.waitUntil(browser.close());
		else await browser.close();
	}
}
