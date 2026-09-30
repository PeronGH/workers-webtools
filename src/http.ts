import { createFetcher } from '@pixel/socket-fetch';
import { connect } from 'cloudflare:sockets';

// Chromium on Linux as recorded by https://github.com/fa0311/latest-user-agent
// (header.json, "linux-chrome"). These identify the browser on every request,
// whatever kind of resource it loads.
export const CHROMIUM_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
	'Accept-Language': 'en-US,en;q=0.9',
	'sec-ch-ua': '"Not A(Brand";v="99", "Chromium";v="154"',
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"Linux"',
};

// Browser-like request headers so sites serve their standard server-rendered
// HTML instead of a bot/blocked page.
export const BROWSER_HEADERS = {
	...CHROMIUM_HEADERS,
	Accept:
		'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
	'Sec-Fetch-Dest': 'document',
	'Sec-Fetch-Mode': 'navigate',
	'Sec-Fetch-Site': 'none',
	'Sec-Fetch-User': '?1',
	'Upgrade-Insecure-Requests': '1',
};

// Anubis (https://github.com/TecharoHQ/anubis) gates browser-like clients behind
// a JavaScript proof-of-work, but scores any non-"Mozilla" User-Agent as benign
// and lets it straight through.
export const CURL_HEADERS = {
	'User-Agent': 'curl/8.7.1',
	Accept: '*/*',
};

const socketFetch = createFetcher({
	connect,
	connectTls: (address) => connect(address, { secureTransport: 'on', allowHalfOpen: false }),
});

/**
 * Fetch over a raw TCP socket so the origin sees only our headers: Workers'
 * `fetch` adds `CF-Worker`, which alone makes Anubis challenge the request.
 * Sockets cannot reach Cloudflare's own IPs, so those fall back to `fetch`.
 */
export const directFetch: typeof fetch = async (input, init) => {
	try {
		return await socketFetch(input, init);
	} catch {
		return fetch(input, init);
	}
};

export interface Page {
	/** Final URL after redirects. */
	url: string;
	/** Lowercased Content-Type header, or an empty string when absent. */
	contentType: string;
	body: Uint8Array<ArrayBuffer>;
}

/** Fetch a URL directly with the given headers. */
export async function fetchPage(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Page> {
	const response = await directFetch(url, { redirect: 'follow', headers, signal });
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}
	return {
		url: response.url || url,
		contentType: (response.headers.get('content-type') ?? '').toLowerCase(),
		body: new Uint8Array(await response.arrayBuffer()),
	};
}

// Kitesurf (https://kitesurf.dev) is Cloudflare's stateless headless browser on
// Workers: it loads the URL, runs its JavaScript and returns the serialized DOM,
// always as HTML whatever the target served. Its request schema is Browser
// Rendering's `/content`.
const KITESURF_HTML = 'https://kitesurf.dev/html';

// A slow origin otherwise burns Kitesurf's whole 60s wall-clock budget. Capping
// the navigation needs `gotoOptions`, which is POST-only. `networkidle0` waits
// for late-loading content, and `bestAttempt` serializes whatever the page had
// at the cap instead of failing the render.
const RENDER_TIMEOUT_MS = 30_000;

// The serialized DOM carries everything Markdown conversion needs, so resource
// bytes never influence the output; blocking them lets `networkidle0` settle
// sooner. Scripts and their data transports (`xhr`, `fetch`, `preflight`) must
// stay, since client-side rendering is the point of rendering.
const REJECT_RESOURCE_TYPES = ['stylesheet', 'image', 'font', 'media', 'manifest', 'texttrack', 'prefetch', 'ping', 'cspviolationreport'];

/** Render a URL in Kitesurf and return the post-JavaScript HTML. */
export async function renderHtml(url: string, signal: AbortSignal): Promise<string> {
	const response = await fetch(KITESURF_HTML, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			url,
			gotoOptions: { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS },
			rejectResourceTypes: REJECT_RESOURCE_TYPES,
			bestAttempt: true,
		}),
		signal,
	});
	if (!response.ok) {
		const detail = (await response.text()).trim();
		throw new Error(`Failed to fetch ${url}: ${response.status} ${detail}`);
	}
	return response.text();
}
