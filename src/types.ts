export type WorkerCtx = { env: Env; ctx?: ExecutionContext; rayId?: string };

export type PageRequest = { url: string; fast?: boolean; full?: boolean };

export type FetchedHtml = { html: string; finalUrl: string };
export type SnapshotData = FetchedHtml & { png: Uint8Array };
