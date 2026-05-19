import type { PageRequest } from './pageTypes';
import { removeSuffix } from './utils';

type UrlMatcher = (url: URL) => boolean;
type UrlRewrite = (url: URL) => void;

export const URL_REWRITES: readonly (readonly [UrlMatcher, UrlRewrite])[] = [
	[
		(url) => url.hostname === 'developers.cloudflare.com' && url.pathname.endsWith('/'),
		(url) => (url.pathname = `${url.pathname}index.md`),
	],
	[
		(url) => url.hostname === 'developer.apple.com' && url.pathname.startsWith('/documentation/') && !url.pathname.endsWith('.md'),
		(url) => (url.pathname = `/tutorials/data${removeSuffix(url.pathname, '/')}.md`),
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
	return url === request.url ? request : { ...request, url };
}
