import type { DefuddleResponse } from 'defuddle/node';
import type { FetchedHtml } from '../types';

const REDDIT_LISTING = /^\/(r|u|user)\/[^/]+(\/[^/]+)?\/?$/;
const SE_QUESTION = /^\/questions\/\d+(\/|$)/;

// Stack Exchange network — all run the same Q&A engine, same DOM, Defuddle mangles question pages the same way.
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

/** Hosts/paths where Defuddle's extractor mangles the structure — we still run
 *  Defuddle on these for challenge detection, but discard its extracted content. */
function shouldUseDefuddleContent(url: URL): boolean {
	if (/(^|\.)reddit\.com$/.test(url.hostname) && REDDIT_LISTING.test(url.pathname)) return false;
	if (isStackExchange(url.hostname) && SE_QUESTION.test(url.pathname)) return false;
	return true;
}

/**
 * Convert a settled page into Markdown. Uses Defuddle's cleaned content on
 * hosts where it improves the result; otherwise feeds the raw HTML to
 * env.AI.toMarkdown (Defuddle's bundled turndown needs DOMParser, which the
 * Workers runtime lacks).
 */
export async function toMarkdown(page: FetchedHtml, defuddle: DefuddleResponse, env: Env): Promise<string> {
	const pageUrl = new URL(page.finalUrl);
	let contentHtml = page.html;
	const meta: Record<string, string | undefined> = { url: page.finalUrl };
	if (shouldUseDefuddleContent(pageUrl)) {
		contentHtml = defuddle.content;
		meta.title = defuddle.title;
		meta.description = defuddle.description;
		meta.author = defuddle.author;
		meta.site = defuddle.site;
		meta.published = defuddle.published;
		meta.image = defuddle.image;
	}
	const result = await env.AI.toMarkdown(
		{ name: 'page.html', blob: new Blob([contentHtml], { type: 'text/html' }) },
		{ conversionOptions: { html: { hostname: pageUrl.origin } } },
	);
	if (result.format !== 'markdown') {
		throw new Error(`Conversion failed: ${result.error ?? 'unknown error'}`);
	}
	return buildFrontMatter(meta) + result.data;
}

function buildFrontMatter(fields: Record<string, string | undefined>): string {
	const entries = Object.entries(fields).filter(([, v]) => v && v.trim().length > 0);
	if (entries.length === 0) return '';
	const lines = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
	return `---\n${lines.join('\n')}\n---\n\n`;
}
