import { Container, getContainer } from '@cloudflare/containers';
import type { FetchedHtml, RenderOptions, SnapshotData, WaitUntil, WorkerCtx } from '../types';

/** Single shared CloakBrowser instance. */
export class CloakBrowser extends Container {
	defaultPort = 8000;
	sleepAfter = '1h';
}

type RpcWaitUntil = 'domcontentloaded' | 'networkidle';

type RpcBody = { url: string; waitUntil: RpcWaitUntil; waitForTimeoutMs: number };

/** Shapes must match container/server.py handlers. */
type Routes = {
	'/fetch': {
		req: RpcBody;
		res: { html: string; finalUrl: string };
	};
	'/snapshot': {
		req: RpcBody;
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

function rpcBody(request: RenderOptions): RpcBody {
	return { url: request.url, ...waitOptions(request.waitUntil) };
}

function waitOptions(waitUntil: WaitUntil): { waitUntil: RpcWaitUntil; waitForTimeoutMs: number } {
	if (waitUntil === 'networkidle') return { waitUntil: 'networkidle', waitForTimeoutMs: 0 };
	if (waitUntil === '15s') return { waitUntil: 'domcontentloaded', waitForTimeoutMs: 15_000 };
	return { waitUntil: 'domcontentloaded', waitForTimeoutMs: 0 };
}

export async function stealthFetchHtml({ env }: WorkerCtx, request: RenderOptions): Promise<FetchedHtml> {
	const data = await rpc(env, '/fetch', rpcBody(request));
	return {
		html: data.html,
		finalUrl: data.finalUrl || request.url,
	};
}

export async function stealthFetchSnapshot({ env }: WorkerCtx, request: RenderOptions): Promise<SnapshotData> {
	const data = await rpc(env, '/snapshot', rpcBody(request));
	return {
		html: data.html,
		png: decodeBase64(data.screenshotBase64),
		finalUrl: data.finalUrl || request.url,
	};
}
