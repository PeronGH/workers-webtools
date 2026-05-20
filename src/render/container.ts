import { Container, getContainer } from '@cloudflare/containers';
import type { FetchedHtml, PageRequest, SnapshotData, WorkerCtx } from '../types';

/** Single shared CloakBrowser instance. */
export class CloakBrowser extends Container {
	defaultPort = 8000;
	sleepAfter = '1h';
}

/** Shapes must match container/server.py handlers. */
type Routes = {
	'/fetch': {
		req: { url: string };
		res: { html: string; finalUrl: string };
	};
	'/snapshot': {
		req: { url: string };
		res: { html: string; screenshotBase64: string; finalUrl: string };
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

export async function fetchHtml({ env }: WorkerCtx, request: PageRequest): Promise<FetchedHtml> {
	const data = await rpc(env, '/fetch', { url: request.url });
	return {
		html: data.html,
		finalUrl: data.finalUrl || request.url,
	};
}

export async function fetchSnapshotData({ env }: WorkerCtx, request: PageRequest): Promise<SnapshotData> {
	const data = await rpc(env, '/snapshot', { url: request.url });
	return {
		html: data.html,
		png: decodeBase64(data.screenshotBase64),
		finalUrl: data.finalUrl || request.url,
	};
}
