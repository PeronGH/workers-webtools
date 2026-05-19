export type WorkerCtx = { env: Env; ctx?: ExecutionContext; rayId?: string };

export type PageRequest = { url: string; fast?: boolean };

export type FetchedHtml = { html: string; finalUrl: string; contentType: string | undefined };
export type SnapshotData = FetchedHtml & { png: Uint8Array };
