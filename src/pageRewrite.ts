import type { PageRequest } from './pageTypes';

type UrlMatcher = (url: URL) => boolean;
type UrlRewrite = (url: URL) => void;

export const FAST_DISABLED_HOSTS = new Set(['github.com', 'developer.apple.com']);

export const URL_REWRITES: readonly (readonly [UrlMatcher, UrlRewrite])[] = [
	[
		(url) => url.hostname === 'developers.cloudflare.com' && url.pathname.endsWith('/'),
		(url) => (url.pathname = `${url.pathname}index.md`),
	],
	[
		(url) => ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname),
		(url) => (url.hostname = 'nitter.tiekoetter.com'),
	],
];

export function rewriteUrl(url: string): string {
	const parsed = new URL(url);
	for (const [matches, rewrite] of URL_REWRITES) {
		if (matches(parsed)) {
			const rewritten = new URL(parsed);
			rewrite(rewritten);
			return rewritten.toString();
		}
	}
	return url;
}

export function rewritePageRequest(request: PageRequest): PageRequest {
	const url = rewriteUrl(request.url);
	const fastDisabled = FAST_DISABLED_HOSTS.has(new URL(url).hostname.toLowerCase());
	if (url === request.url && !fastDisabled) return request;
	return fastDisabled ? { ...request, url, fast: false } : { ...request, url };
}
