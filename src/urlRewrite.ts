import type { PageRequest } from './browser';

type UrlMatcher = (url: URL) => boolean;
type UrlRewrite = (url: URL) => string;

export const URL_REWRITES: readonly (readonly [UrlMatcher, UrlRewrite])[] = [
	[
		(url) => ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname),
		(url) => {
			const rewritten = new URL(url);
			rewritten.hostname = 'nitter.tiekoetter.com';
			return rewritten.toString();
		},
	],
];

export function rewriteUrl(url: string): string {
	const parsed = new URL(url);
	for (const [matches, rewrite] of URL_REWRITES) {
		if (matches(parsed)) return rewrite(parsed);
	}
	return url;
}

export function rewritePageRequest(request: PageRequest): PageRequest {
	const url = rewriteUrl(request.url);
	return url === request.url ? request : { ...request, url };
}
