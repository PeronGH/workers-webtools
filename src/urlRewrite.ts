import type { PageRequest } from './browser';

export const URL_REWRITES: readonly (readonly [RegExp, (url: string) => string])[] = [
	[
		/^https?:\/\/(?:[a-z0-9-]+\.)+wikipedia\.org\/(?:wiki\/|w\/index\.php\b)/i,
		(url) => {
			const source = new URL(url);
			const title = source.pathname.startsWith('/wiki/')
				? decodeURIComponent(source.pathname.slice('/wiki/'.length))
				: source.searchParams.get('title');
			if (!title) return url;

			const rewritten = new URL('/w/index.php', source.origin);
			rewritten.searchParams.set('title', title);
			rewritten.searchParams.set('action', 'raw');
			const oldid = source.searchParams.get('oldid');
			if (oldid) rewritten.searchParams.set('oldid', oldid);
			return rewritten.toString();
		},
	],
];

export function rewriteUrl(url: string): string {
	for (const [pattern, rewrite] of URL_REWRITES) {
		if (pattern.test(url)) return rewrite(url);
	}
	return url;
}

export function rewritePageRequest(request: PageRequest): PageRequest {
	const url = rewriteUrl(request.url);
	return url === request.url ? request : { ...request, url };
}
