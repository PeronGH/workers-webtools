import type { PageRequest } from './browser';

type UrlMatcher = (url: URL) => boolean;
type UrlRewrite = (url: URL) => string;

export const URL_REWRITES: readonly (readonly [UrlMatcher, UrlRewrite])[] = [
	[
		(url) => url.hostname.endsWith('.wikipedia.org') && (url.pathname.startsWith('/wiki/') || url.pathname === '/w/index.php'),
		(url) => {
			const title = url.pathname.startsWith('/wiki/')
				? decodeURIComponent(url.pathname.slice('/wiki/'.length))
				: url.searchParams.get('title');
			if (!title) return url.toString();

			const rewritten = new URL('/w/index.php', url.origin);
			rewritten.searchParams.set('title', title);
			rewritten.searchParams.set('action', 'raw');
			const oldid = url.searchParams.get('oldid');
			if (oldid) rewritten.searchParams.set('oldid', oldid);
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
