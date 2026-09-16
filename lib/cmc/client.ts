import { createHash } from "node:crypto";
import type { CmcStatus } from "./types";

export class CmcError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | string | null = null,
    readonly path: string = "",
  ) {
    super(message);
    this.name = "CmcError";
  }
}

export interface Evidence {
  id: string;
  label: string;
  /** Full request URL (the key travels in a header, never in the URL). */
  url: string;
  /** Copy-pasteable curl with a placeholder instead of the key. */
  curl: string;
  requestedAt: string;
  durationMs: number;
  httpStatus: number;
  creditCount: number;
  errorCode: number | string | null;
  errorMessage: string | null;
  cacheHit: boolean;
  responseBody: unknown;
}

export interface EvidenceSummary {
  id: string;
  label: string;
  url: string;
  curl: string;
  requestedAt: string;
  httpStatus: number;
  creditCount: number;
  cacheHit: boolean;
  errorMessage: string | null;
  /**
   * The raw response, inlined when the caller needs it rendered immediately.
   * Serverless instances do not share memory, so a page that only stored the
   * body in a process-local buffer could lose it before the user opens the
   * drawer — inlining keeps the proof attached to the page that cites it.
   */
  responseBody?: unknown;
}

export interface CmcFetchOptions {
  ttlMs?: number;
  /** Skip the in-memory cache (used for freshness-critical demos). */
  fresh?: boolean;
  retries?: number;
}

export interface CmcResult<T> {
  data: T;
  evidenceId: string;
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
  evidenceId: string;
}

const EVIDENCE_LIMIT = 150;
const CACHE_LIMIT = 120;

const evidenceStore = new Map<string, Evidence>();
const evidenceOrder: string[] = [];
const cache = new Map<string, CacheEntry>();

let sessionCredits = 0;
let sessionRequests = 0;

const BASE_URL = "https://pro-api.coinmarketcap.com";

export const DEFAULT_TTL_MS: Record<string, number> = {
  "/v5/real-world-assets/map": 30_000,
  "/v5/real-world-assets/info": 60_000,
  "/v5/real-world-assets/assets/list": 60_000,
  "/v5/real-world-assets/quotes/latest": 60_000,
  "/v5/real-world-assets/issuers/list": 60_000,
  "/v5/real-world-assets/issuers": 60_000,
  "/v2/cryptocurrency/ohlcv/historical": 6 * 60 * 60 * 1000,
};

function ttlFor(path: string): number {
  return DEFAULT_TTL_MS[path] ?? 60_000;
}

export function creditUsage(): { credits: number; requests: number } {
  return { credits: sessionCredits, requests: sessionRequests };
}

export function getEvidence(id: string): Evidence | undefined {
  return evidenceStore.get(id);
}

export function evidenceSummaries(
  ids: string[],
  options: { includeBody?: boolean } = {},
): EvidenceSummary[] {
  const out: EvidenceSummary[] = [];
  for (const id of ids) {
    const e = evidenceStore.get(id);
    if (!e) continue;
    out.push({
      id: e.id,
      label: e.label,
      url: e.url,
      curl: e.curl,
      requestedAt: e.requestedAt,
      httpStatus: e.httpStatus,
      creditCount: e.creditCount,
      cacheHit: e.cacheHit,
      errorMessage: e.errorMessage,
      ...(options.includeBody ? { responseBody: e.responseBody } : {}),
    });
  }
  return out;
}

export function listEvidence(limit = 20): EvidenceSummary[] {
  return evidenceOrder
    .slice(-limit)
    .reverse()
    .map((id) => evidenceStore.get(id))
    .filter((e): e is Evidence => Boolean(e))
    .map((e) => ({
      id: e.id,
      label: e.label,
      url: e.url,
      curl: e.curl,
      requestedAt: e.requestedAt,
      httpStatus: e.httpStatus,
      creditCount: e.creditCount,
      cacheHit: e.cacheHit,
      errorMessage: e.errorMessage,
    }));
}

function rememberEvidence(entry: Evidence) {
  evidenceStore.set(entry.id, entry);
  const existing = evidenceOrder.indexOf(entry.id);
  if (existing !== -1) evidenceOrder.splice(existing, 1);
  evidenceOrder.push(entry.id);
  if (evidenceOrder.length > EVIDENCE_LIMIT) {
    const dropped = evidenceOrder.shift();
    if (dropped) evidenceStore.delete(dropped);
  }
}

function trimCache() {
  if (cache.size <= CACHE_LIMIT) return;
  const overflow = cache.size - CACHE_LIMIT;
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++removed >= overflow) break;
  }
}

function evidenceIdFor(path: string, url: string): string {
  return createHash("sha1").update(`${path}|${url}`).digest("hex").slice(0, 16);
}

function buildUrl(
  path: string,
  params: Record<string, string | number | undefined | null>,
): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}`.length > 0) query.set(k, `${v}`);
  }
  const qs = query.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;
}

function extractStatus(body: unknown): CmcStatus | null {
  if (typeof body !== "object" || body === null) return null;
  const status = (body as { status?: unknown }).status;
  if (typeof status !== "object" || status === null) return null;
  return status as CmcStatus;
}

/**
 * Core server-side CoinMarketCap Pro API request.
 *
 * Responsibilities, all in one place:
 *  - the API key stays in the process environment; it is never logged, cached
 *    in evidence, or returned to the client
 *  - every call is recorded as evidence (full request + full response) so the
 *    UI can show the exact upstream payload behind any rendered number
 *  - CMC returns HTTP 200 with a non-zero `status.error_code` for some
 *    failures, so both layers are checked before data is trusted
 *  - in-memory TTL cache with LRU trim, retry with backoff on 429/5xx
 *  - in-flight de-duplication so parallel server components share one request
 */
async function request<T>(
  path: string,
  params: Record<string, string | number | undefined | null>,
  options: CmcFetchOptions,
): Promise<CmcResult<T>> {
  const apiKey = process.env.CMC_API_KEY;
  if (!apiKey) {
    throw new CmcError("CMC_API_KEY is not configured on the server", 500, "NO_KEY", path);
  }

  const url = buildUrl(path, params);
  const now = Date.now();

  if (!options.fresh) {
    const hit = cache.get(url);
    if (hit && hit.expiresAt > now) {
      const prior = evidenceStore.get(hit.evidenceId);
      if (prior) {
        rememberEvidence({
          ...prior,
          cacheHit: true,
          requestedAt: new Date().toISOString(),
          durationMs: 0,
        });
        return { data: hit.value as T, evidenceId: prior.id };
      }
    }
  }

  const retries = options.retries ?? 1;
  let attempt = 0;
  let lastError: CmcError | null = null;

  while (attempt <= retries) {
    const started = Date.now();
    sessionRequests += 1;
    try {
      const res = await fetch(url, {
        headers: { "X-CMC_PRO_API_KEY": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const durationMs = Date.now() - started;
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text.slice(0, 2000) };
      }

      const status = extractStatus(body);
      const creditCount = Number(status?.credit_count ?? 0) || 0;
      sessionCredits += creditCount;

      const id = evidenceIdFor(path, url);
      rememberEvidence({
        id,
        label: path,
        url,
        curl: `curl -s "${url}" \\\n  --header 'X-CMC_PRO_API_KEY: $CMC_API_KEY'`,
        requestedAt: new Date().toISOString(),
        durationMs,
        httpStatus: res.status,
        creditCount,
        errorCode: status?.error_code ?? null,
        errorMessage: status?.error_message ?? null,
        cacheHit: false,
        responseBody: body,
      });

      const errorCode = status?.error_code;
      const apiError = errorCode != null && String(errorCode) !== "0";

      if (!res.ok || apiError) {
        const message =
          status?.error_message || `CoinMarketCap responded ${res.status}`;
        lastError = new CmcError(message, res.status, errorCode ?? null, path);
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < retries) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        throw lastError;
      }

      const data = (body as { data?: unknown }).data as T;
      cache.set(url, { value: data, expiresAt: Date.now() + (options.ttlMs ?? ttlFor(path)), evidenceId: id });
      trimCache();
      return { data, evidenceId: id };
    } catch (error) {
      if (error instanceof CmcError && !(error.status === 429 || error.status >= 500)) {
        throw error;
      }
      lastError =
        error instanceof CmcError
          ? error
          : new CmcError(
              error instanceof Error ? error.message : "Network failure calling CoinMarketCap",
              502,
              "NETWORK",
              path,
            );
      if (attempt < retries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
    }
  }

  throw lastError ?? new CmcError("Unknown CoinMarketCap failure", 502, null, path);
}

const inflight = new Map<string, Promise<unknown>>();

/** CoinMarketCap Pro API call — returns the `data` payload, cached + evidenced. */
export async function cmcGet<T>(
  path: string,
  params: Record<string, string | number | undefined | null> = {},
  options: CmcFetchOptions = {},
): Promise<T> {
  const key = `${path}|${JSON.stringify(params)}|${options.fresh ? "fresh" : "cached"}`;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = request<T>(path, params, options)
    .then((r) => r.data)
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** Same as `cmcGet`, plus the evidence id for the exact upstream call. */
export async function cmcGetWithEvidence<T>(
  path: string,
  params: Record<string, string | number | undefined | null> = {},
  options: CmcFetchOptions = {},
): Promise<CmcResult<T>> {
  return request<T>(path, params, options);
}

/**
 * Unwraps a CMC list endpoint result, tolerating the two shapes the API uses
 * (`data.rwa_assets` arrays and `data` maps keyed by id).
 */
export function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}
