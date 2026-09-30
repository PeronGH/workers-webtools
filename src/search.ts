import { CHROMIUM_HEADERS, directFetch } from "./http";

// Google Custom Search Engine, ported from SearXNG's `google_cse` engine: a CSE
// exposes the regular Google index as JSONP with no API key, so results come
// straight from Google instead of through somebody's SearXNG instance.
// https://github.com/searxng/searxng/blob/master/searx/engines/google_cse.py

const CX = "partner-pub-8993703457585266:4862972284"; // blackle.com
const LIBRARY_URL = `https://cse.google.com/cse/cse.js?cx=${CX}`;
const ENDPOINT = "https://cse.google.com/cse/element/v1";

const PAGE_SIZE = 20;
/** Google stops serving a CSE past six pages, i.e. 120 results. */
export const MAX_PAGES = 6;
const TOKEN_TTL_MS = 60 * 60 * 1000;

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

interface CseToken {
	token: string;
	version: string;
	exp: string;
}

interface CseResponse {
	error?: { code?: number; message?: string };
	results?: {
		unescapedUrl?: string;
		titleNoFormatting?: string;
		contentNoFormatting?: string;
	}[];
}

// Isolate-scoped: an isolate serves many requests, so most searches reuse it.
let cachedToken: { value: CseToken; expiresAt: number } | undefined;

/** Mint the token the element endpoint demands, caching it until it expires. */
async function cseToken(signal: AbortSignal): Promise<CseToken> {
	if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

	const response = await directFetch(LIBRARY_URL, { headers: { ...CHROMIUM_HEADERS, Accept: "*/*" }, signal });
	if (!response.ok) {
		throw new Error(`Failed to obtain a Google CSE token: ${response.status} ${response.statusText}`);
	}

	const text = await response.text();
	// The library script ends with one options object: `...});`.
	const options = JSON.parse(text.slice(text.lastIndexOf("({") + 1, text.lastIndexOf("});") + 1)) as {
		cse_token?: string;
		cselibVersion?: string;
		exp?: string[];
	};
	if (!options.cse_token) {
		throw new Error("Google CSE library script carries no token");
	}

	const value = { token: options.cse_token, version: options.cselibVersion ?? "", exp: options.exp?.join(",") ?? "" };
	cachedToken = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
	return value;
}

async function searchPage(query: string, start: number, token: CseToken, signal: AbortSignal): Promise<SearchResult[]> {
	const params = new URLSearchParams({
		rsz: "filtered_cse",
		num: String(PAGE_SIZE),
		hl: "en",
		cselibv: token.version,
		cx: CX,
		q: query,
		// Explicitly unfiltered: omitting `safe` falls back to whatever the CSE's
		// own control panel is set to, which we neither control nor know.
		safe: "off",
		cse_tok: token.token,
		callback: "_",
		// Empty, but required: dropping `rurl` altogether gets a 403.
		rurl: "",
		searchtype: "",
	});
	if (token.exp) params.set("exp", token.exp);
	if (start) params.set("start", String(start));

	const response = await directFetch(`${ENDPOINT}?${params}`, {
		headers: { ...CHROMIUM_HEADERS, Accept: "*/*", Referer: "https://cse.google.com/", Cookie: "CONSENT=YES+" },
		signal,
	});
	if (!response.ok) {
		throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
	}

	const text = await response.text();
	const data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as CseResponse;
	if (data.error) {
		const { code, message } = data.error;
		throw new Error(`Google CSE search failed${code ? ` (${code})` : ""}: ${message ?? "unknown error"}`);
	}

	const results: SearchResult[] = [];
	for (const item of data.results ?? []) {
		if (!item.unescapedUrl) continue;
		results.push({
			title: item.titleNoFormatting?.trim() ?? "",
			url: item.unescapedUrl,
			snippet: item.contentNoFormatting?.trim() ?? "",
		});
	}
	return results;
}

/** Search the web, returning results in relevance order. */
export async function search(query: string, pages: number, signal: AbortSignal): Promise<SearchResult[]> {
	// Pages are independent, so they go out together once the token is minted.
	const token = await cseToken(signal);
	const settled = await Promise.allSettled(
		Array.from({ length: pages }, (_, page) => searchPage(query, page * PAGE_SIZE, token, signal)),
	);

	// Keep the pages that answered, in request order so relevance order survives;
	// only a total wipeout is worth reporting as a failure.
	const results: SearchResult[] = [];
	let failure: PromiseRejectedResult | undefined;
	for (const outcome of settled) {
		if (outcome.status === "fulfilled") {
			results.push(...outcome.value);
		} else {
			failure ??= outcome;
		}
	}
	if (results.length === 0 && failure) throw failure.reason;
	return results;
}

/** Render results as a numbered Markdown list. */
export function formatSearchResults(results: readonly SearchResult[]): string {
	return results
		.map(({ title, url, snippet }, i) => {
			const number = i + 1;
			const indent = " ".repeat(String(number).length + 2);
			return `${number}. [${title}](${url})\n${indent}${snippet}\n`;
		})
		.join("\n");
}
