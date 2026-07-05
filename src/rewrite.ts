import type { PageRequest } from './types';

/**
 * A site-specific rewrite: the first rule whose `match` hits is applied.
 * `url` mutates the target in place; `options` forces request options the
 * site is known to need (overriding whatever the caller asked for).
 */
type Rule = {
	match: (url: URL) => boolean;
	url?: (url: URL) => void;
	options?: Partial<Omit<PageRequest, 'url'>>;
};

function removeSuffix(value: string, suffix: string): string {
	return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

const RULES: readonly Rule[] = [
	{
		match: (url) => url.hostname === 'developers.cloudflare.com' && !/\.[a-z]+$/.test(url.pathname),
		url: (url) => {
			url.pathname = url.pathname.endsWith('/') ? `${url.pathname}index.md` : `${url.pathname}/index.md`;
		},
	},
	{
		match: (url) => url.hostname === 'developer.apple.com' && url.pathname.startsWith('/documentation/'),
		url: (url) => (url.pathname = `/tutorials/data${removeSuffix(url.pathname, '/').toLowerCase()}.md`),
	},
	{
		match: (url) => ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname),
		url: (url) => (url.hostname = 'nitter.tiekoetter.com'),
	},
	{
		// eddrit mirrors Reddit's URL scheme; it sits behind Anubis, which only the stealth browser clears.
		match: (url) => /(^|\.)reddit\.com$/.test(url.hostname),
		url: (url) => (url.hostname = 'eddrit.com'),
		options: { stealth: true },
	},
];

export function rewritePageRequest(request: PageRequest): PageRequest {
	const url = new URL(request.url);
	const rule = RULES.find((r) => r.match(url));
	if (!rule) return request;
	rule.url?.(url);
	return { ...request, ...rule.options, url: url.toString() };
}
