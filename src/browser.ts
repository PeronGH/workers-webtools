import { Container, getContainer } from '@cloudflare/containers';

/** Worker-runtime context. `ctx` lets callers detach background work via
 *  ctx.waitUntil. `rayId` is preserved for log correlation only — the
 *  Container is a singleton, so it no longer selects which instance to use. */
export type WorkerCtx = { env: Env; ctx?: ExecutionContext; rayId?: string };

/** Per-call rendering options. */
export type PageRequest = { url: string; renderMode?: 'spa' | 'ssr' };

export type FetchedHtml = { html: string; finalUrl: string; contentType: string | undefined };
export type SnapshotData = FetchedHtml & { png: Uint8Array };

/** Container hosting one CloakBrowser instance. `max_instances: 1` in
 *  wrangler.jsonc plus a default `getContainer(env.CLOAK)` (no name)
 *  keeps all traffic on the single shared instance. */
export class CloakBrowser extends Container {
	defaultPort = 8000;
	// sleepAfter intentionally unset — uses the SDK default (10m).
	// Idle expiry doubles as a free recycle of the shared browser.
}

const CLOAK_ORIGIN = 'http://cloak';

function decodeBase64(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export async function fetchHtml({ env }: WorkerCtx, request: PageRequest): Promise<FetchedHtml> {
	const r = await getContainer(env.CLOAK).fetch(`${CLOAK_ORIGIN}/fetch`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url: request.url, mode: request.renderMode ?? 'spa' }),
	});
	if (!r.ok) throw new Error(`CloakBrowser /fetch ${r.status}: ${await r.text()}`);
	const data = (await r.json()) as { html: string; finalUrl: string; contentType: string };
	return {
		html: data.html,
		finalUrl: data.finalUrl || request.url,
		contentType: data.contentType || undefined,
	};
}

export async function fetchSnapshotData({ env }: WorkerCtx, request: PageRequest): Promise<SnapshotData> {
	const r = await getContainer(env.CLOAK).fetch(`${CLOAK_ORIGIN}/snapshot`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ url: request.url }),
	});
	if (!r.ok) throw new Error(`CloakBrowser /snapshot ${r.status}: ${await r.text()}`);
	const data = (await r.json()) as { html: string; screenshotBase64: string; finalUrl: string; contentType: string };
	return {
		html: data.html,
		png: decodeBase64(data.screenshotBase64),
		finalUrl: data.finalUrl || request.url,
		contentType: data.contentType || undefined,
	};
}
