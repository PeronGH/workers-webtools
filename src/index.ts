import { Hono } from 'hono';
import Cloudflare from 'cloudflare';

type Bindings = Env & {
	CLOUDFLARE_ACCOUNT_ID: string;
	CLOUDFLARE_API_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/fetch/*', async (c) => {
	const marker = '/fetch/';
	const idx = c.req.url.indexOf(marker);
	const target = c.req.url.slice(idx + marker.length);

	if (!/^https?:\/\//i.test(target)) {
		return c.text('Target URL must start with http:// or https://', 400);
	}

	const client = new Cloudflare({ apiToken: c.env.CLOUDFLARE_API_TOKEN });
	const markdown = await client.browserRendering.markdown.create({
		account_id: c.env.CLOUDFLARE_ACCOUNT_ID,
		url: target,
		gotoOptions: { waitUntil: 'networkidle2', timeout: 10000 },
		bestAttempt: true,
	});

	return c.body(markdown, 200, {
		'Content-Type': 'text/markdown; charset=utf-8',
	});
});

export default app;
