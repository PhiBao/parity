export type RwaAssetType =
  | "stock"
  | "commodity"
  | "currency"
  | "government_security"
  | "etf"
  | "real_estate";

export interface CmcStatus {
  timestamp: string;
  error_code: number | string;
  error_message: string | null;
  elapsed: number;
  credit_count: number;
  notice?: string | null;
}

export interface CmcEnvelope<T> {
  data: T;
  status: CmcStatus;
}

export interface RwaIdMapEntry {
  name: string;
  symbol: string;
  slug: string;
  rwa_id: number;
  asset_type: RwaAssetType;
  rwa_rank: number;
  has_tokens: boolean;
  first_historical_data: string;
  last_historical_data: string;
}

export interface RwaQuote {
  symbol: string;
  crypto_id: number;
  average_tokenized_price: number | null;
  tokenized_market_cap: number | null;
  tokenized_volume_24h: number | null;
  last_updated: string;
}

export interface RwaToken {
  symbol: string;
  name: string;
  price: number | null;
  crypto_id: number;
  issuer_id: string | null;
  issuer_name: string | null;
  market_cap: number | null;
  volume_24h: number | null;
}

export interface RwaTradfiMarket {
  exchange: { slug: string; name: string; exchange_id: number };
  ticker: string;
  market_url: string;
}

export interface RwaAsset {
  name: string;
  symbol: string;
  slug: string;
  quotes: RwaQuote[];
  rwa_id: number;
  asset_type: RwaAssetType;
  rwa_rank: number;
  has_tokens: boolean;
  average_tokenized_price: number | null;
  tokenized_market_cap: number | null;
  tokenized_volume_24h: number | null;
  last_updated: string;
  tokens: RwaToken[];
  tradfi_markets?: RwaTradfiMarket[];
}

export interface RwaInfoAsset {
  name: string;
  symbol: string;
  slug: string;
  website: string | null;
  employees: number | null;
  founded: string | null;
  industry: string | null;
  cik: string | null;
  about: {
    description: string | null;
    logo: string | null;
    website: string | null;
    date_added: string | null;
  } | null;
  rwa_id: number;
  asset_type: RwaAssetType;
  rwa_rank: number;
  has_tokens: boolean;
  primary_exchange: string | null;
}

export interface RwaIssuer {
  name: string;
  website: string | null;
  logo: string | null;
  issuer_id: string;
  num_tokens: number;
}

export interface RwaIssuerDetail {
  name: string;
  website: string | null;
  logo: string | null;
  tokens: { name: string; symbol: string; crypto_id: number; rwa_id: number }[];
  issuer_id: string;
  num_tokens: number;
  total_size: number;
  has_more: boolean;
}

export interface OhlcvQuote {
  quote: {
    USD: {
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number | null;
      market_cap: number | null;
      timestamp: string;
    };
  };
}

export interface OhlcvHistorical {
  id: number;
  name: string;
  symbol: string;
  quotes: OhlcvQuote[];
}

export interface RwaAssetsList {
  total_size: number;
  has_more: boolean;
  rwa_assets: RwaAsset[];
}

export interface RwaQuotesLatest {
  rwa_assets: RwaAsset[];
}

export interface RwaIdMap {
  rwa_assets: RwaIdMapEntry[];
  total_size: number;
  has_more: boolean;
}

export interface RwaInfoResult {
  rwa_assets: RwaInfoAsset[];
}

export interface RwaIssuersList {
  issuers: RwaIssuer[];
  total_size: number;
  has_more: boolean;
}
