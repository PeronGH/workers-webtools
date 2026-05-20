import type { DefuddleResponse } from 'defuddle/node';
import type { FetchedHtml } from '../types';

const REDDIT_LISTING = /^\/(r|u|user)\/[^/]+(\/[^/]+)?\/?$/;
const SE_QUESTION = /^\/questions\/\d+(\/|$)/;

/** Stack Exchange hosts share the same Q&A engine, so Defuddle mangles question pages identically across them. */
const STACKEXCHANGE_HOSTS = new Set([
	'stackoverflow.com',
	'serverfault.com',
	'superuser.com',
	'askubuntu.com',
	'mathoverflow.net',
	'stackapps.com',
]);

function isStackExchange(hostname: string): boolean {
	return STACKEXCHANGE_HOSTS.has(hostname) || hostname.endsWith('.stackexchange.com');
}

/** Hosts and paths where Defuddle is known to mangle the extracted content. */
function defuddleManglesUrl(url: URL): boolean {
	if (/(^|\.)reddit\.com$/.test(url.hostname) && REDDIT_LISTING.test(url.pathname)) return true;
	if (isStackExchange(url.hostname) && SE_QUESTION.test(url.pathname)) return true;
	if (url.hostname === 'xdaforums.com' && url.pathname.startsWith('/t/')) return true;
	return false;
}

/** Convert a settled page into Markdown via env.AI.toMarkdown. */
export async function toMarkdown(
	page: FetchedHtml,
	defuddle: DefuddleResponse,
	options: { env: Env; full?: boolean },
): Promise<string> {
	const { env, full = false } = options;
	const pageUrl = new URL(page.finalUrl);
	const useDefuddle = !full && defuddle.wordCount > 0 && !defuddleManglesUrl(pageUrl);
	const contentHtml = useDefuddle ? defuddle.content : page.html;
	const result = await env.AI.toMarkdown(
		{ name: 'page.html', blob: new Blob([contentHtml], { type: 'text/html' }) },
		{ conversionOptions: { html: { hostname: pageUrl.origin } } },
	);
	if (result.format !== 'markdown') {
		throw new Error(`Conversion failed: ${result.error ?? 'unknown error'}`);
	}
	if (!useDefuddle) return result.data;
	return (
		buildFrontMatter({
			url: page.finalUrl,
			title: defuddle.title,
			description: defuddle.description,
			author: defuddle.author,
			site: defuddle.site,
			published: defuddle.published,
			image: defuddle.image,
		}) + result.data
	);
}

function buildFrontMatter(fields: Record<string, string | undefined>): string {
	const entries = Object.entries(fields).filter(([, v]) => v && v.trim().length > 0);
	if (entries.length === 0) return '';
	const lines = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
	return `---\n${lines.join('\n')}\n---\n\n`;
}
