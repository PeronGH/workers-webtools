import { launch } from '@cloudflare/playwright';

export type Browser = Awaited<ReturnType<typeof launch>>;
type BrowserContext = Awaited<ReturnType<Browser['newContext']>>;
export type Page = Awaited<ReturnType<BrowserContext['newPage']>>;
type GotoOptions = NonNullable<Parameters<Page['goto']>[1]>;

export const TIMEOUT = 10000;

/** Worker-runtime context. When `ctx` is provided, browser.close() is detached
 *  via ctx.waitUntil so the caller returns as soon as the action's result is ready. */
export type WorkerCtx = { env: Env; ctx?: ExecutionContext };

/** Per-call rendering options. */
export type PageRequest = { url: string; waitUntil?: GotoOptions['waitUntil'] };

export async function withBrowser<T>({ env, ctx }: WorkerCtx, action: (browser: Browser) => Promise<T>): Promise<T> {
	const browser = await launch(env.BROWSER);
	try {
		return await action(browser);
	} finally {
		if (ctx) ctx.waitUntil(browser.close());
		else await browser.close();
	}
}
