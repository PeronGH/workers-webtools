import { SETTLED_EXTRA_MS } from '../constants';
import type { FetchedHtml, RenderOptions, WaitUntil } from '../types';

const GOTO_TIMEOUT_MS = 15_000;

export async function fetchHtml(env: Env, request: RenderOptions): Promise<FetchedHtml> {
	const response = await env.BROWSER.quickAction('content', {
		url: request.url,
		...waitOptions(request.waitUntil),
		// The serialized DOM carries everything markdown extraction needs, so resource bytes never
		// influence the output; blocking them lets networkidle0 settle sooner. Scripts and the
		// transports feeding them (xhr, fetch, preflight) must stay.
		rejectResourceTypes: ['stylesheet', 'image', 'font', 'media', 'manifest', 'texttrack', 'prefetch', 'ping', 'cspviolationreport'],
		// Awaited-event timeouts serialize whatever the page had at the cap instead of failing the
		// request — the same best-effort capture the stealth container uses.
		bestAttempt: true,
	});
	if (!response.ok) {
		// bestAttempt covers goto/wait timeouts, so a !ok response is a genuine API failure
		// (rate limit, bad input): surfacing it lets the client retry with stealth=true.
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
