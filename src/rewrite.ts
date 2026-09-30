/**
 * How a page is fetched: `default` fetches directly as a browser and retries as
 * curl past an Anubis challenge, `curl` fetches directly as curl only, and
 * `renderer` renders the page in Kitesurf.
 */
export type FetchAs = "default" | "curl" | "renderer";

// Some sites serve JavaScript shells or block plain fetches but expose clean
// content at a sibling URL.
interface UrlRewrite {
	matches: (url: URL) => boolean;
	rewrite: (url: URL) => void;
	/** How to fetch the rewritten source, overriding the caller's choice. */
	fetchAs?: FetchAs;
}

function removeSuffix(value: string, suffix: string): string {
	return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

const URL_REWRITES: readonly UrlRewrite[] = [
	{
		matches: (url) => url.hostname === "developer.apple.com" && url.pathname.startsWith("/documentation/"),
		rewrite: (url) => {
			url.pathname = `/tutorials/data${removeSuffix(url.pathname, "/").toLowerCase()}.md`;
		},
		// The rewritten source is raw Markdown; a browser has nothing to render.
		fetchAs: "default",
	},
	{
		matches: (url) => ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname),
		rewrite: (url) => {
			url.hostname = "nitter.tiekoetter.com";
		},
		// Nitter serves server-rendered HTML behind an Anubis gate that only lets
		// curl through.
		fetchAs: "curl",
	},
	{
		// reddit.com 403s plain fetches; eddrit serves the same paths as clean
		// server-rendered HTML.
		matches: (url) => /(^|\.)reddit\.com$/.test(url.hostname),
		rewrite: (url) => {
			url.hostname = "eddrit.com";
		},
		// Same Anubis gate as Nitter.
		fetchAs: "curl",
	},
];

/** Rewrite a URL to a better source, with how that source must be fetched. */
export function rewriteUrl(url: string): { url: string; fetchAs?: FetchAs } {
	const parsed = new URL(url);
	for (const { matches, rewrite, fetchAs } of URL_REWRITES) {
		if (matches(parsed)) {
			rewrite(parsed);
			return { url: parsed.toString(), fetchAs };
		}
	}
	return { url };
}
