import Cloudflare from 'cloudflare';
import type { FetchedHtml, PageRequest, WorkerCtx } from '../types';

export async function fetchFastHtml({ env }: WorkerCtx, request: PageRequest): Promise<FetchedHtml> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
	if (!accountId || !apiToken) {
		throw new Error('Fast mode requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN secrets; set them or disable fast mode.');
	}
	const client = new Cloudflare({ apiToken });
	const html = await client.browserRendering.content.create({
		account_id: accountId,
		url: request.url,
		gotoOptions: { waitUntil: 'domcontentloaded' },
		rejectResourceTypes: ['image', 'media', 'font', 'texttrack', 'prefetch'],
	});
	return {
		html,
		finalUrl: request.url,
	};
}
