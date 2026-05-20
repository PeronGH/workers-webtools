import Cloudflare from 'cloudflare';
import type { FetchedHtml, RenderOptions, WaitUntil, WorkerCtx } from '../types';

const GOTO_TIMEOUT_MS = 15_000;

export async function fetchHtml({ env }: WorkerCtx, request: RenderOptions): Promise<FetchedHtml> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
	if (!accountId || !apiToken) {
		throw new Error('Browser Rendering requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN secrets.');
	}
	const client = new Cloudflare({ apiToken });
	const html = await client.browserRendering.content.create({
		account_id: accountId,
		url: request.url,
		...waitOptions(request.waitUntil),
		rejectResourceTypes: ['image', 'media', 'font', 'texttrack', 'prefetch'],
	});
	return {
		html,
		finalUrl: request.url,
	};
}

function waitOptions(waitUntil: WaitUntil): {
	gotoOptions: { waitUntil: 'domcontentloaded' | 'networkidle0'; timeout: number };
	waitForTimeout?: number;
} {
	if (waitUntil === 'networkidle') {
		return { gotoOptions: { waitUntil: 'networkidle0', timeout: GOTO_TIMEOUT_MS } };
	}
	if (waitUntil === 'extra5s') {
		return { gotoOptions: { waitUntil: 'networkidle0', timeout: GOTO_TIMEOUT_MS }, waitForTimeout: 5_000 };
	}
	return { gotoOptions: { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS } };
}
