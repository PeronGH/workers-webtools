import type { PageRequest, WaitUntil } from './types';

export const WAIT_UNTIL_VALUES = ['domcontentloaded', 'networkidle', 'settled'] as const satisfies readonly WaitUntil[];

export const SETTLED_EXTRA_MS = 5_000;

/** Defaults for ask/snapshot/screenshot: full stealth render, no defuddle, wait for settle. */
export const STEALTH_DEFAULTS: Omit<PageRequest, 'url'> = {
	stealth: true,
	raw: true,
	waitUntil: 'settled',
};
