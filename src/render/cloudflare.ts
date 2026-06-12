import { SETTLED_EXTRA_MS } from '../constants';
import type { FetchedHtml, RenderOptions, WaitUntil, WorkerCtx } from '../types';

const GOTO_TIMEOUT_MS = 15_000;

export async function fetchHtml({ env }: WorkerCtx, request: RenderOptions): Promise<FetchedHtml> {
	const response = await env.BROWSER.quickAction('content', {
		url: request.url,
		...waitOptions(request.waitUntil),
		rejectResourceTypes: ['image', 'media', 'font', 'texttrack', 'prefetch'],
	});
	if (!response.ok) {
		throw new Error(`Browser Rendering content failed (${response.status}): ${await response.text()}`);
	}
	return {
		html: await response.text(),
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
	if (waitUntil === 'settled') {
		return { gotoOptions: { waitUntil: 'networkidle0', timeout: GOTO_TIMEOUT_MS }, waitForTimeout: SETTLED_EXTRA_MS };
	}
	return { gotoOptions: { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS } };
}
