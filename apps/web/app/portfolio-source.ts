import type { Failure } from './api-error';
export type PortfolioSource<T> = { data: T | null; error: Failure | null; retry: () => void };
