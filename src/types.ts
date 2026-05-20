export type WorkerCtx = { env: Env; ctx?: ExecutionContext; rayId?: string };

export type WaitUntil = 'domcontentloaded' | 'networkidle' | '15s';
export type RenderOptions = { url: string; waitUntil: WaitUntil };
export type FetchOptions = RenderOptions & { stealth: boolean };
export type PageRequest = FetchOptions & { raw: boolean };

export type FetchedHtml = { html: string; finalUrl: string };
export type SnapshotData = FetchedHtml & { png: Uint8Array };
