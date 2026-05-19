import { Container, getContainer } from '@cloudflare/containers';
import Cloudflare from 'cloudflare';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Worker-runtime context. `ctx` lets callers detach background work via
 *  ctx.waitUntil. `rayId` is preserved for log correlation only — the
 *  Container is a singleton, so it no longer selects which instance to use. */
export type WorkerCtx = { env: Env; ctx?: ExecutionContext; rayId?: string };

export type PageRequest = { url: string; fast?: boolean };

export type FetchedHtml = { html: string; finalUrl: string; contentType: string | undefined };
export type SnapshotData = FetchedHtml & { png: Uint8Array };

/** Container hosting one CloakBrowser instance. `max_instances: 1` in
 *  wrangler.jsonc plus a default `getContainer(env.CLOAK)` (no name)
 *  keeps all traffic on the single shared instance. */
export class CloakBrowser extends Container {
	defaultPort = 8000;
	sleepAfter = '1h';
}

// ---------------------------------------------------------------------------
// RPC contract with container/server.py — keep request/response shapes in
// lockstep with the Python handlers in container/server.py.
// ---------------------------------------------------------------------------

type Routes = {
	'/fetch': {
		req: { url: string };
		res: { html: string; finalUrl: string; contentType: string };
	};
	'/snapshot': {
		req: { url: string };
		res: { html: string; screenshotBase64: string; finalUrl: string; contentType: string };
	};
};

const CLOAK_ORIGIN = 'http://cloak';

async function rpc<P extends keyof Routes>(env: Env, path: P, body: Routes[P]['req']): Promise<Routes[P]['res']> {
	const r = await getContainer(env.CLOAK).fetch(`${CLOAK_ORIGIN}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!r.ok) throw new Error(`CloakBrowser ${path} ${r.status}: ${await r.text()}`);
	return (await r.json()) as Routes[P]['res'];
}

function decodeBase64(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export async function fetchHtml({ env }: WorkerCtx, request: PageRequest): Promise<FetchedHtml> {
	const data = await rpc(env, '/fetch', { url: request.url });
	return {
		html: data.html,
		finalUrl: data.finalUrl || request.url,
		contentType: data.contentType || undefined,
	};
}

export async function fetchFastHtml({ env }: WorkerCtx, request: PageRequest): Promise<FetchedHtml> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
	if (!accountId || !apiToken) {
		throw new Error('Fast mode requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN secrets; set them or disable fast mode.');
	}
	const client = new Cloudflare({ apiToken });
	const html = await client.browserRendering.content.create({
		account_id: accountId,
		url: request.url,
		gotoOptions: { waitUntil: 'domcontentloaded' },
		rejectResourceTypes: ['image', 'media', 'font', 'texttrack', 'prefetch'],
	});
	return {
		html,
		finalUrl: request.url,
		contentType: 'text/html',
	};
}

export async function fetchSnapshotData({ env }: WorkerCtx, request: PageRequest): Promise<SnapshotData> {
	const data = await rpc(env, '/snapshot', { url: request.url });
	return {
		html: data.html,
		png: decodeBase64(data.screenshotBase64),
		finalUrl: data.finalUrl || request.url,
		contentType: data.contentType || undefined,
	};
}
