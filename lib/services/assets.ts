import {
  cmcGet,
  cmcGetWithEvidence,
  creditUsage,
  evidenceSummaries,
  type EvidenceSummary,
} from "@/lib/cmc/client";
import type {
  RwaAsset,
  RwaAssetsList,
  RwaIdMap,
  RwaInfoResult,
  RwaIssuer,
  RwaIssuersList,
  RwaQuotesLatest,
} from "@/lib/cmc/types";
import { fetchReference } from "@/lib/reference";
import type { ReferenceQuote } from "@/lib/reference";
import { TOKEN_REFERENCE_OVERRIDES, REFERENCE_MAP, referenceFor } from "@/lib/reference/mapping";
import { buildVerdict, type VerdictResult } from "@/lib/verdict/engine";
import { buildHistory, type HistoryPayload } from "@/lib/verdict/history";

export interface AssetPayload {
  verdict: VerdictResult;
  evidence: EvidenceSummary[];
  /** Request/response the verdict was built from, key redacted. */
  info: {
    assetType: string;
    description: string | null;
    website: string | null;
    industry: string | null;
    employees: number | null;
    founded: string | null;
    cik: string | null;
    dateAdded: string | null;
    tradfiMarkets: { name: string; ticker: string; url: string }[];
  } | null;
  issuers: { id: string; name: string; website: string | null; numTokens: number }[];
  generatedAt: string;
}

const BOARD_SIZE = 18;
const SCREENER_UNIVERSE = 250;

async function quoteFor(
  identifier: { symbol?: string; rwa_slug?: string },
  evidenceSink?: string[],
): Promise<RwaAsset | null> {
  const { data, evidenceId } = await cmcGetWithEvidence<RwaQuotesLatest>(
    "/v5/real-world-assets/quotes/latest",
    { ...identifier, convert: "USD" },
  );
  evidenceSink?.push(evidenceId);
  return data.rwa_assets?.[0] ?? null;
}

/** Fetch the reference for the asset, plus any per-token overrides. */
async function resolveReferences(asset: RwaAsset): Promise<{
  reference: ReferenceQuote | null;
  tokenReferences: Record<string, ReferenceQuote | null>;
  note: string | null;
  proxy: boolean;
}> {
  const spec = referenceFor(asset.symbol);
  const overrideTokens = asset.tokens
    .map((t) => t.symbol)
    .filter((s) => TOKEN_REFERENCE_OVERRIDES[s]);

  const [reference, ...overrideResults] = await Promise.all([
    spec ? fetchReference(spec) : Promise.resolve(null),
    ...overrideTokens.map(async (symbol) => {
      const overrideSpec = referenceFor(asset.symbol, symbol);
      return overrideSpec ? fetchReference(overrideSpec) : null;
    }),
  ]);

  const tokenReferences: Record<string, ReferenceQuote | null> = {};
  overrideTokens.forEach((symbol, i) => {
    tokenReferences[symbol] = overrideResults[i] ?? null;
  });

  return {
    reference: reference ?? null,
    tokenReferences,
    note: spec?.note ?? null,
    proxy: Boolean(spec?.proxy),
  };
}

export async function getAsset(key: string, options: { fresh?: boolean } = {}): Promise<AssetPayload | null> {
  const isSlug = /^[a-z0-9-]+$/.test(key) && key === key.toLowerCase() && !/^\d+$/.test(key);
  const evidenceIds: string[] = [];

  const { data: quoteBody, evidenceId: quoteEvidence } = await cmcGetWithEvidence<RwaQuotesLatest>(
    "/v5/real-world-assets/quotes/latest",
    {
      ...(isSlug ? { rwa_slug: key } : { symbol: key.toUpperCase() }),
      convert: "USD",
      skip_invalid: "true",
    },
    { fresh: options.fresh },
  );
  evidenceIds.push(quoteEvidence);
  const asset = quoteBody.rwa_assets?.[0] ?? null;
  if (!asset) return null;

  const [refs, infoResult, issuersResult] = await Promise.all([
    resolveReferences(asset),
    cmcGetWithEvidence<RwaInfoResult>(
      "/v5/real-world-assets/info",
      { rwa_id: asset.rwa_id },
      { fresh: options.fresh },
    ).catch(() => null),
    cmcGetWithEvidence<RwaIssuersList>("/v5/real-world-assets/issuers/list", { limit: 250 }).catch(
      () => null,
    ),
  ]);
  if (infoResult) evidenceIds.push(infoResult.evidenceId);
  if (issuersResult) evidenceIds.push(issuersResult.evidenceId);

  const verdict = buildVerdict(asset, refs.reference, {
    tokenReferences: refs.tokenReferences,
    referenceNote: refs.note,
    referenceProxy: refs.proxy,
  });

  const infoAsset = infoResult?.data?.rwa_assets?.[0] ?? null;
  const issuersData = issuersResult?.data?.issuers ?? [];

  // Link the issuers that actually appear as wrapper issuers on this asset.
  const issuerNames = new Set(
    asset.tokens.map((t) => t.issuer_name).filter((n): n is string => Boolean(n)),
  );
  const issuers = issuersData
    .filter((i: RwaIssuer) => issuerNames.has(i.name))
    .map((i) => ({ id: i.issuer_id, name: i.name, website: i.website, numTokens: i.num_tokens }));

  return {
    verdict,
    evidence: evidenceSummaries(evidenceIds),
    info: infoAsset
      ? {
          assetType: infoAsset.asset_type,
          description: infoAsset.about?.description ?? null,
          website: infoAsset.website ?? infoAsset.about?.website ?? null,
          industry: infoAsset.industry,
          employees: infoAsset.employees,
          founded: infoAsset.founded,
          cik: infoAsset.cik,
          dateAdded: infoAsset.about?.date_added ?? null,
          tradfiMarkets: (asset.tradfi_markets ?? []).map((m) => ({
            name: m.exchange.name,
            ticker: m.ticker,
            url: m.market_url,
          })),
        }
      : null,
    issuers,
    generatedAt: new Date().toISOString(),
  };
}

export async function getAssetHistory(asset: RwaAsset): Promise<HistoryPayload | null> {
  return buildHistory(asset);
}

export async function getAssetRaw(key: string): Promise<RwaAsset | null> {
  const isSlug = /^[a-z0-9-]+$/.test(key) && key === key.toLowerCase() && !/^\d+$/.test(key);
  return quoteFor(isSlug ? { rwa_slug: key } : { symbol: key.toUpperCase() });
}

export interface BoardRow extends VerdictResult {
  sparkline?: number[];
}

export interface BoardPayload {
  asOf: string;
  assets: BoardRow[];
  universeSize: number;
  creditsUsed: { credits: number; requests: number };
}

/**
 * The flagship view: reference-backed verdicts for the most liquid tokenised
 * instruments, priced against their TradFi counterparts.
 */
export async function getBoard(): Promise<BoardPayload> {
  const list = await cmcGet<RwaAssetsList>(
    "/v5/real-world-assets/assets/list",
    { limit: 60, sort: "tokenized_volume_24h", sort_dir: "desc" },
  ).catch(() => null);

  if (!list?.rwa_assets?.length) {
    return { asOf: new Date().toISOString(), assets: [], universeSize: 0, creditsUsed: creditUsage() };
  }

  const universe = list.rwa_assets;

  // Prefer assets we can price against a real reference; fill the rest with
  // the highest-volume relative-only assets so the board is never empty.
  const mapped = universe.filter((a) => REFERENCE_MAP[a.symbol]);
  const unmapped = universe.filter((a) => !REFERENCE_MAP[a.symbol]);
  const chosen = [...mapped.slice(0, BOARD_SIZE), ...unmapped.slice(0, 3)];

  const symbols = chosen.map((a) => a.symbol).join(",");
  const quotes = await cmcGet<RwaQuotesLatest>(
    "/v5/real-world-assets/quotes/latest",
    { symbol: symbols, convert: "USD", skip_invalid: "true" },
    { ttlMs: 60_000 },
  ).catch(() => null);

  const assets = quotes?.rwa_assets ?? [];
  const rows = await Promise.all(
    assets.map(async (asset) => {
      const refs = await resolveReferences(asset);
      return buildVerdict(asset, refs.reference, {
        tokenReferences: refs.tokenReferences,
        referenceNote: refs.note,
        referenceProxy: refs.proxy,
      });
    }),
  );

  const score = (v: VerdictResult) => {
    if (v.verdict === "NO_DATA" || v.verdict === "ILLIQUID") return -1;
    const p = Math.abs(v.premiumPct ?? 0);
    const spread = (v.spreadBps ?? 0) / 100;
    return p + spread * 0.5;
  };

  rows.sort((a, b) => score(b) - score(a));

  return {
    asOf: new Date().toISOString(),
    assets: rows,
    universeSize: list.total_size ?? 0,
    creditsUsed: creditUsage(),
  };
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  slug: string;
  assetType: string;
  rwaRank: number;
  wrapperCount: number;
  volume24h: number;
  spreadBps: number | null;
  bestSymbol: string | null;
  bestIssuer: string | null;
  worstSymbol: string | null;
  worstIssuer: string | null;
  aggregatePrice: number | null;
  dispersionPct: number | null;
}

export interface ScreenerPayload {
  asOf: string;
  rows: ScreenerRow[];
  scanned: number;
  creditsUsed: { credits: number; requests: number };
}

/**
 * Whole-universe relative screen: every asset in the top 250 by tokenised
 * volume, ranked by cross-wrapper dislocation. Needs no external reference,
 * so it can run across the entire universe cheaply.
 */
export async function getScreener(): Promise<ScreenerPayload> {
  const list = await cmcGet<RwaAssetsList>(
    "/v5/real-world-assets/assets/list",
    { limit: SCREENER_UNIVERSE, sort: "tokenized_volume_24h", sort_dir: "desc" },
  ).catch(() => null);
  if (!list?.rwa_assets?.length) {
    return { asOf: new Date().toISOString(), rows: [], scanned: 0, creditsUsed: creditUsage() };
  }

  const symbols = list.rwa_assets.map((a) => a.symbol);
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 100) chunks.push(symbols.slice(i, i + 100));

  const quoteResponses = await Promise.all(
    chunks.map((chunk) =>
      cmcGet<RwaQuotesLatest>(
        "/v5/real-world-assets/quotes/latest",
        { symbol: chunk.join(","), convert: "USD", skip_invalid: "true" },
      ).catch(() => null),
    ),
  );

  const assets = quoteResponses.flatMap((r) => r?.rwa_assets ?? []);
  const rows: ScreenerRow[] = [];

  for (const asset of assets) {
    const verdict = buildVerdict(asset, null);
    if (verdict.verdict === "NO_DATA") continue;
    if (verdict.best == null) continue;
    if (verdict.totalVolume24h < 100_000) continue;
    rows.push({
      symbol: asset.symbol,
      name: asset.name,
      slug: asset.slug,
      assetType: asset.asset_type,
      rwaRank: asset.rwa_rank,
      wrapperCount: verdict.liveCount,
      volume24h: verdict.totalVolume24h,
      spreadBps: verdict.spreadBps,
      bestSymbol: verdict.best?.symbol ?? null,
      bestIssuer: verdict.best?.issuerName ?? null,
      worstSymbol: verdict.worst?.symbol ?? null,
      worstIssuer: verdict.worst?.issuerName ?? null,
      aggregatePrice: verdict.price,
      dispersionPct: verdict.dispersionPct,
    });
  }

  rows.sort((a, b) => (b.spreadBps ?? 0) - (a.spreadBps ?? 0));

  return {
    asOf: new Date().toISOString(),
    rows: rows.slice(0, 80),
    scanned: assets.length,
    creditsUsed: creditUsage(),
  };
}

export interface SearchResult {
  symbol: string;
  name: string;
  slug: string;
  assetType: string;
  rwaRank: number;
  hasReference: boolean;
}

export async function searchAssets(query: string): Promise<SearchResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const [list, map] = await Promise.all([
    cmcGet<RwaAssetsList>("/v5/real-world-assets/assets/list", {
      limit: 250,
      sort: "tokenized_volume_24h",
      sort_dir: "desc",
    }).catch(() => null),
    cmcGet<RwaIdMap>("/v5/real-world-assets/map", { limit: 250, sort: "rwa_rank" }).catch(() => null),
  ]);

  const seen = new Set<string>();
  const results: SearchResult[] = [];

  const push = (asset: {
    symbol: string;
    name: string;
    slug: string;
    asset_type: string;
    rwa_rank: number;
  }) => {
    if (seen.has(asset.symbol)) return;
    seen.add(asset.symbol);
    results.push({
      symbol: asset.symbol,
      name: asset.name,
      slug: asset.slug,
      assetType: asset.asset_type,
      rwaRank: asset.rwa_rank,
      hasReference: Boolean(REFERENCE_MAP[asset.symbol]),
    });
  };

  const matches = (symbol: string, name: string, slug: string) =>
    symbol.toLowerCase().includes(q) || name.toLowerCase().includes(q) || slug.includes(q);

  for (const a of map?.rwa_assets ?? []) {
    if (matches(a.symbol, a.name, a.slug)) push(a);
  }
  for (const a of list?.rwa_assets ?? []) {
    if (matches(a.symbol, a.name, a.slug)) push(a);
  }

  results.sort((a, b) => {
    const aExact = a.symbol.toLowerCase() === q ? 0 : 1;
    const bExact = b.symbol.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.rwaRank - b.rwaRank;
  });

  return results.slice(0, 8);
}

export interface FeaturedAsset {
  symbol: string;
  name: string;
  assetType: string;
}
