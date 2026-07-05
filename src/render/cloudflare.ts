import { SETTLED_EXTRA_MS } from '../constants';
import type { FetchedHtml, RenderOptions, WaitUntil } from '../types';

const GOTO_TIMEOUT_MS = 15_000;

export async function fetchHtml(env: Env, request: RenderOptions): Promise<FetchedHtml> {
	const response = await env.BROWSER.quickAction('content', {
		url: request.url,
		...waitOptions(request.waitUntil),
		rejectResourceTypes: ['image', 'media', 'font', 'texttrack', 'prefetch'],
	});
	if (!response.ok) {
		// Hard failure by design, unlike the stealth container's best-effort capture:
		// surfacing the error lets the client retry with stealth=true.
		throw new Error(`Browser Rendering content failed (${response.status}): ${await response.text()}`);
	}
	return {
		html: await response.text(),
		// quickAction('content') doesn't expose the post-redirect URL, so redirected pages
		// resolve relative links and Defuddle host rules against the request URL.
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
