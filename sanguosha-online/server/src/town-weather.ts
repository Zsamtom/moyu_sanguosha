import { z } from "zod";

const HOUR_MS = 60 * 60 * 1_000;

export const TOWN_WEATHER_BUCKET_MS = 8 * HOUR_MS;
export const TOWN_WEATHER_DEFAULT_TIMEOUT_MS = 3_000;
export const TOWN_WEATHER_LAST_KNOWN_GOOD_MS = 72 * HOUR_MS;

export const TOWN_WEATHER_TOWN_IDS = ["greenvale", "frostpeak"] as const;
export type TownWeatherTownId = (typeof TOWN_WEATHER_TOWN_IDS)[number];

export const NORMALIZED_TOWN_WEATHER_IDS = [
  "clear",
  "gentle_rain",
  "heatwave",
  "frost",
] as const;
export type NormalizedTownWeatherId =
  (typeof NORMALIZED_TOWN_WEATHER_IDS)[number];

export const TOWN_WEATHER_DISASTER_MECHANIC_IDS = [
  "mountain_seepage",
  "cold_snap",
  "heatwave",
  "windstorm",
  "hail",
  "drought",
] as const;
export type TownWeatherDisasterMechanicId =
  (typeof TOWN_WEATHER_DISASTER_MECHANIC_IDS)[number];

export interface TownWeatherAnchor {
  readonly townId: TownWeatherTownId;
  readonly fictionalName: string;
  readonly realCityName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: "Asia/Shanghai";
  readonly utcOffsetMinutes: 480;
}

export const TOWN_WEATHER_ANCHORS: Readonly<
  Record<TownWeatherTownId, TownWeatherAnchor>
> = {
  greenvale: {
    townId: "greenvale",
    fictionalName: "青禾镇",
    realCityName: "成都",
    latitude: 30.57,
    longitude: 104.07,
    timezone: "Asia/Shanghai",
    utcOffsetMinutes: 480,
  },
  frostpeak: {
    townId: "frostpeak",
    fictionalName: "霜岭镇",
    realCityName: "香格里拉",
    latitude: 27.83,
    longitude: 99.7,
    timezone: "Asia/Shanghai",
    utcOffsetMinutes: 480,
  },
};

export interface TownWeatherProviderAlert {
  readonly id: string;
  readonly eventCode: string;
  readonly eventName: string;
  readonly headline: string;
  readonly description: string;
  readonly instruction: string | null;
  readonly senderName: string | null;
  readonly messageType: string | null;
  readonly severity: string | null;
  readonly certainty: string | null;
  readonly urgency: string | null;
  readonly colorCode: string | null;
  readonly issuedAt: number | null;
  readonly effectiveAt: number | null;
  readonly expiresAt: number | null;
}

export interface TownWeatherProviderResult {
  readonly provider: string;
  readonly observedAt: number;
  readonly conditionCode: string;
  readonly conditionText: string;
  readonly temperatureC: number;
  readonly feelsLikeC: number;
  readonly humidityPercent: number;
  readonly precipitationMm: number;
  readonly windSpeedKph: number;
  readonly visibilityKm: number;
  readonly alerts: readonly TownWeatherProviderAlert[];
  readonly attributions: readonly string[];
}

export interface TownWeatherProvider {
  fetchTownWeather(
    anchor: TownWeatherAnchor,
    signal: AbortSignal,
  ): Promise<TownWeatherProviderResult>;
}

export interface TownWeatherDisasterRule {
  readonly mechanicId: TownWeatherDisasterMechanicId;
  readonly label: string;
}

export interface TownWeatherRules {
  resolveWeatherId(
    weather: TownWeatherProviderResult,
    anchor: TownWeatherAnchor,
  ): NormalizedTownWeatherId;
  resolveDisaster(
    alert: TownWeatherProviderAlert,
    anchor: TownWeatherAnchor,
  ): TownWeatherDisasterRule | null;
}

export interface NormalizedTownWeatherObservation {
  readonly conditionCode: string | null;
  readonly conditionText: string;
  readonly observedAt: number | null;
  readonly temperatureC: number | null;
  readonly feelsLikeC: number | null;
  readonly humidityPercent: number | null;
  readonly precipitationMm: number | null;
  readonly windSpeedKph: number | null;
  readonly visibilityKm: number | null;
}

export interface NormalizedTownWeatherDisaster {
  readonly providerAlertId: string;
  readonly eventCode: string;
  readonly eventName: string;
  readonly headline: string;
  readonly description: string;
  readonly instruction: string | null;
  readonly senderName: string | null;
  readonly messageType: string | null;
  readonly severity: 1 | 2 | 3;
  readonly certainty: string | null;
  readonly urgency: string | null;
  readonly colorCode: string | null;
  readonly issuedAt: number | null;
  readonly effectiveAt: number | null;
  readonly expiresAt: number | null;
  readonly mechanicId: TownWeatherDisasterMechanicId | null;
  readonly mechanicLabel: string | null;
  readonly affectsGameplay: boolean;
}

export type TownWeatherSnapshotSource =
  | "qweather"
  | "last_known_good"
  | "deterministic_fallback";

export interface TownWeatherSnapshot {
  readonly townId: TownWeatherTownId;
  readonly anchor: TownWeatherAnchor;
  readonly bucketKey: string;
  readonly validFrom: number;
  readonly validUntil: number;
  readonly fetchedAt: number;
  readonly provider: string | null;
  readonly source: TownWeatherSnapshotSource;
  readonly stale: boolean;
  /**
   * Deterministic fallback is deliberately informational only. Consumers must
   * not apply weather/disaster modifiers when this is false.
   */
  readonly mechanicsEnabled: boolean;
  readonly weatherId: NormalizedTownWeatherId;
  readonly observation: NormalizedTownWeatherObservation;
  readonly disasters: readonly NormalizedTownWeatherDisaster[];
  readonly attributions: readonly string[];
  readonly fallbackReason: string | null;
}

export interface QWeatherProviderConfig {
  readonly apiHost: string;
  readonly apiKey: string;
}

type FetchLike = typeof fetch;

const numericValue = z.union([
  z.number(),
  z.string().trim().regex(/^-?(?:\d+\.?\d*|\.\d+)$/),
]).transform(Number).refine(Number.isFinite, "Expected a finite number");

function boundedNumber(minimum: number, maximum: number) {
  return numericValue.refine(
    (value) => value >= minimum && value <= maximum,
    `Expected a number between ${minimum} and ${maximum}`,
  );
}

const qWeatherNowSchema = z.object({
  code: z.literal("200"),
  now: z.object({
    obsTime: z.string().min(1),
    temp: boundedNumber(-100, 100),
    feelsLike: boundedNumber(-120, 120),
    icon: z.string().min(1),
    text: z.string().min(1),
    windSpeed: boundedNumber(0, 500),
    humidity: boundedNumber(0, 100),
    precip: boundedNumber(0, 10_000),
    vis: boundedNumber(0, 1_000),
  }).passthrough(),
  refer: z.object({
    sources: z.array(z.string()).optional(),
    license: z.array(z.string()).optional(),
  }).passthrough().optional(),
}).passthrough();

const optionalAlertText = z.string().nullable().optional();
const qWeatherAlertSchema = z.object({
  id: z.string().min(1),
  senderName: optionalAlertText,
  issuedTime: optionalAlertText,
  messageType: z.object({
    code: z.string().nullable().optional(),
  }).passthrough().nullable().optional(),
  eventType: z.object({
    name: z.string().min(1),
    code: z.string().min(1),
  }).passthrough(),
  urgency: optionalAlertText,
  severity: optionalAlertText,
  certainty: optionalAlertText,
  color: z.object({
    code: z.string().nullable().optional(),
  }).passthrough().nullable().optional(),
  effectiveTime: optionalAlertText,
  expireTime: optionalAlertText,
  headline: z.string().default(""),
  description: z.string().default(""),
  instruction: optionalAlertText,
}).passthrough();

const qWeatherAlertsSchema = z.object({
  metadata: z.object({
    attributions: z.array(z.string()).optional(),
  }).passthrough().optional(),
  alerts: z.array(qWeatherAlertSchema).default([]),
}).passthrough();

function parsedTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedApiHost(value: string): string {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export class QWeatherProvider implements TownWeatherProvider {
  private readonly apiHost: string;

  constructor(
    config: QWeatherProviderConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.apiHost = normalizedApiHost(config.apiHost);
    this.apiKey = config.apiKey;
  }

  private readonly apiKey: string;

  async fetchTownWeather(
    anchor: TownWeatherAnchor,
    signal: AbortSignal,
  ): Promise<TownWeatherProviderResult> {
    const latitude = anchor.latitude.toFixed(2);
    const longitude = anchor.longitude.toFixed(2);
    const nowUrl = new URL("/v7/weather/now", this.apiHost);
    nowUrl.searchParams.set("location", `${longitude},${latitude}`);
    nowUrl.searchParams.set("lang", "zh");
    const alertsUrl = new URL(
      `/weatheralert/v1/current/${latitude}/${longitude}`,
      this.apiHost,
    );
    alertsUrl.searchParams.set("localTime", "false");
    alertsUrl.searchParams.set("lang", "zh");

    const [nowPayload, alertsPayload] = await Promise.all([
      this.request(nowUrl, signal),
      this.request(alertsUrl, signal),
    ]);
    const current = qWeatherNowSchema.parse(nowPayload);
    const warnings = qWeatherAlertsSchema.parse(alertsPayload);
    const observedAt = parsedTimestamp(current.now.obsTime);
    if (observedAt === null) {
      throw new Error("QWeather returned an invalid observation timestamp");
    }

    const alerts: TownWeatherProviderAlert[] = warnings.alerts.map((alert) => ({
      id: alert.id,
      eventCode: alert.eventType.code,
      eventName: alert.eventType.name,
      headline: alert.headline,
      description: alert.description,
      instruction: alert.instruction ?? null,
      senderName: alert.senderName ?? null,
      messageType: alert.messageType?.code ?? null,
      severity: alert.severity ?? null,
      certainty: alert.certainty ?? null,
      urgency: alert.urgency ?? null,
      colorCode: alert.color?.code ?? null,
      issuedAt: parsedTimestamp(alert.issuedTime),
      effectiveAt: parsedTimestamp(alert.effectiveTime),
      expiresAt: parsedTimestamp(alert.expireTime),
    }));
    const attributions = new Set([
      ...(current.refer?.sources ?? []),
      ...(current.refer?.license ?? []),
      ...(warnings.metadata?.attributions ?? []),
    ]);

    return {
      provider: "qweather",
      observedAt,
      conditionCode: current.now.icon,
      conditionText: current.now.text,
      temperatureC: current.now.temp,
      feelsLikeC: current.now.feelsLike,
      humidityPercent: current.now.humidity,
      precipitationMm: current.now.precip,
      windSpeedKph: current.now.windSpeed,
      visibilityKm: current.now.vis,
      alerts,
      attributions: [...attributions],
    };
  }

  private async request(url: URL, signal: AbortSignal): Promise<unknown> {
    const response = await this.fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-QW-Api-Key": this.apiKey,
      },
      signal,
    });
    if (!response.ok) {
      throw new Error(`QWeather request failed with HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new Error("QWeather returned malformed JSON", { cause: error });
    }
  }
}

function searchableAlertText(alert: TownWeatherProviderAlert): string {
  return [
    alert.eventCode,
    alert.eventName,
    alert.headline,
    alert.description,
  ].join(" ").toLocaleLowerCase();
}

export const DEFAULT_TOWN_WEATHER_RULES: TownWeatherRules = {
  resolveWeatherId(weather) {
    const text = `${weather.conditionCode} ${weather.conditionText}`
      .toLocaleLowerCase();
    if (
      weather.temperatureC <= 0 ||
      /雪|冻|冰|snow|sleet|freez|icy/.test(text)
    ) {
      return "frost";
    }
    if (
      weather.temperatureC >= 35 ||
      /高温|热浪|酷热|heatwave|extreme heat/.test(text)
    ) {
      return "heatwave";
    }
    if (
      weather.precipitationMm > 0 ||
      /雨|雷暴|rain|drizzle|shower|thunderstorm/.test(text)
    ) {
      return "gentle_rain";
    }
    return "clear";
  },
  resolveDisaster(alert) {
    if (alert.messageType?.toLocaleLowerCase() === "cancel") return null;
    const text = searchableAlertText(alert);
    if (/暴雨|洪水|强降雨|rainstorm|torrential rain|flood/.test(text)) {
      return { mechanicId: "mountain_seepage", label: "强降雨与渗水" };
    }
    if (
      /寒潮|霜冻|低温|冰冻|道路结冰|暴雪|雪灾|cold wave|frost|freez|blizzard|snowstorm/.test(
        text,
      )
    ) {
      return { mechanicId: "cold_snap", label: "寒潮与冰雪" };
    }
    if (/高温|热浪|干热风|heatwave|extreme heat/.test(text)) {
      return { mechanicId: "heatwave", label: "高温热浪" };
    }
    if (/大风|台风|龙卷|windstorm|strong wind|typhoon|tornado/.test(text)) {
      return { mechanicId: "windstorm", label: "强风" };
    }
    if (/冰雹|hail/.test(text)) {
      return { mechanicId: "hail", label: "冰雹" };
    }
    if (/干旱|drought/.test(text)) {
      return { mechanicId: "drought", label: "干旱" };
    }
    return null;
  },
};

function severityForAlert(alert: TownWeatherProviderAlert): 1 | 2 | 3 {
  switch (alert.severity?.toLocaleLowerCase()) {
    case "extreme":
    case "severe":
      return 3;
    case "moderate":
      return 2;
    case "minor":
      return 1;
  }
  switch (alert.colorCode?.toLocaleLowerCase()) {
    case "red":
      return 3;
    case "orange":
      return 2;
    default:
      return 1;
  }
}

function validateProviderResult(
  result: TownWeatherProviderResult,
): TownWeatherProviderResult {
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.provider !== "string" ||
    !result.provider.trim() ||
    !Number.isFinite(result.observedAt) ||
    typeof result.conditionCode !== "string" ||
    typeof result.conditionText !== "string" ||
    !Number.isFinite(result.temperatureC) ||
    !Number.isFinite(result.feelsLikeC) ||
    !Number.isFinite(result.humidityPercent) ||
    result.humidityPercent < 0 ||
    result.humidityPercent > 100 ||
    !Number.isFinite(result.precipitationMm) ||
    result.precipitationMm < 0 ||
    !Number.isFinite(result.windSpeedKph) ||
    result.windSpeedKph < 0 ||
    !Number.isFinite(result.visibilityKm) ||
    result.visibilityKm < 0 ||
    !Array.isArray(result.alerts) ||
    !Array.isArray(result.attributions)
  ) {
    throw new Error("Weather provider returned an invalid payload");
  }
  return structuredClone(result);
}

function hashText(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function townWeatherBucketStart(
  now: number,
  utcOffsetMinutes = 480,
): number {
  if (!Number.isFinite(now)) {
    throw new TypeError("Weather bucket time must be finite");
  }
  const offset = utcOffsetMinutes * 60 * 1_000;
  return Math.floor((now + offset) / TOWN_WEATHER_BUCKET_MS) *
    TOWN_WEATHER_BUCKET_MS - offset;
}

function bucketKey(townId: TownWeatherTownId, validFrom: number): string {
  return `${townId}:${new Date(validFrom).toISOString()}`;
}

interface LastKnownGood {
  readonly result: TownWeatherProviderResult;
  readonly fetchedAt: number;
}

export interface TownWeatherServiceOptions {
  readonly provider?: TownWeatherProvider;
  readonly rules?: TownWeatherRules;
  readonly anchors?: Readonly<Record<TownWeatherTownId, TownWeatherAnchor>>;
  readonly timeoutMs?: number;
  readonly lastKnownGoodMs?: number;
  readonly clock?: () => number;
  readonly onProviderError?: (
    error: unknown,
    townId: TownWeatherTownId,
  ) => void;
}

function normalizedDisasters(
  result: TownWeatherProviderResult,
  anchor: TownWeatherAnchor,
  rules: TownWeatherRules,
  effectiveAt: number,
): NormalizedTownWeatherDisaster[] {
  return result.alerts
    .filter((alert) => alert.expiresAt === null || alert.expiresAt > effectiveAt)
    .map((alert) => {
    const rule = rules.resolveDisaster(alert, anchor);
    return {
      providerAlertId: alert.id,
      eventCode: alert.eventCode,
      eventName: alert.eventName,
      headline: alert.headline,
      description: alert.description,
      instruction: alert.instruction,
      senderName: alert.senderName,
      messageType: alert.messageType,
      severity: severityForAlert(alert),
      certainty: alert.certainty,
      urgency: alert.urgency,
      colorCode: alert.colorCode,
      issuedAt: alert.issuedAt,
      effectiveAt: alert.effectiveAt,
      expiresAt: alert.expiresAt,
      mechanicId: rule?.mechanicId ?? null,
      mechanicLabel: rule?.label ?? null,
      affectsGameplay: rule !== null,
    };
    });
}

function providerSnapshot(input: {
  result: TownWeatherProviderResult;
  anchor: TownWeatherAnchor;
  rules: TownWeatherRules;
  validFrom: number;
  fetchedAt: number;
  source: "qweather" | "last_known_good";
  fallbackReason?: string;
}): TownWeatherSnapshot {
  const { result, anchor, rules, validFrom, fetchedAt, source } = input;
  return {
    townId: anchor.townId,
    anchor: structuredClone(anchor),
    bucketKey: bucketKey(anchor.townId, validFrom),
    validFrom,
    validUntil: validFrom + TOWN_WEATHER_BUCKET_MS,
    fetchedAt,
    provider: result.provider,
    source,
    stale: source === "last_known_good",
    mechanicsEnabled: true,
    weatherId: rules.resolveWeatherId(result, anchor),
    observation: {
      conditionCode: result.conditionCode,
      conditionText: result.conditionText,
      observedAt: result.observedAt,
      temperatureC: result.temperatureC,
      feelsLikeC: result.feelsLikeC,
      humidityPercent: result.humidityPercent,
      precipitationMm: result.precipitationMm,
      windSpeedKph: result.windSpeedKph,
      visibilityKm: result.visibilityKm,
    },
    disasters: normalizedDisasters(result, anchor, rules, validFrom),
    attributions: [...result.attributions],
    fallbackReason: input.fallbackReason ?? null,
  };
}

function deterministicFallback(
  anchor: TownWeatherAnchor,
  validFrom: number,
  fetchedAt: number,
  reason: string,
): TownWeatherSnapshot {
  const fallbackVariant = hashText(`${anchor.townId}:${validFrom}`) % 2;
  return {
    townId: anchor.townId,
    anchor: structuredClone(anchor),
    bucketKey: bucketKey(anchor.townId, validFrom),
    validFrom,
    validUntil: validFrom + TOWN_WEATHER_BUCKET_MS,
    fetchedAt,
    provider: null,
    source: "deterministic_fallback",
    stale: true,
    mechanicsEnabled: false,
    weatherId: "clear",
    observation: {
      conditionCode: null,
      conditionText: fallbackVariant === 0
        ? "气象数据暂不可用，本周期按中性规则运行"
        : "暂未取得可靠实况，本周期不应用天气倍率",
      observedAt: null,
      temperatureC: null,
      feelsLikeC: null,
      humidityPercent: null,
      precipitationMm: null,
      windSpeedKph: null,
      visibilityKm: null,
    },
    disasters: [],
    attributions: [],
    fallbackReason: reason,
  };
}

function fallbackReason(error: unknown): string {
  if (error instanceof TownWeatherTimeoutError) return "provider_timeout";
  return "provider_error";
}

class TownWeatherTimeoutError extends Error {
  constructor() {
    super("Town weather provider timed out");
    this.name = "TownWeatherTimeoutError";
  }
}

export class TownWeatherService {
  private readonly provider?: TownWeatherProvider;
  private readonly rules: TownWeatherRules;
  private readonly anchors: Readonly<
    Record<TownWeatherTownId, TownWeatherAnchor>
  >;
  private readonly timeoutMs: number;
  private readonly lastKnownGoodMs: number;
  private readonly clock: () => number;
  private readonly onProviderError?: TownWeatherServiceOptions[
    "onProviderError"
  ];
  private readonly cache = new Map<string, TownWeatherSnapshot>();
  private readonly inFlight = new Map<string, Promise<TownWeatherSnapshot>>();
  private readonly lastKnownGood = new Map<TownWeatherTownId, LastKnownGood>();

  constructor(options: TownWeatherServiceOptions = {}) {
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1)
    ) {
      throw new TypeError("Town weather timeout must be a positive number");
    }
    if (
      options.lastKnownGoodMs !== undefined &&
      (!Number.isFinite(options.lastKnownGoodMs) ||
        options.lastKnownGoodMs < 0)
    ) {
      throw new TypeError(
        "Town weather last-known-good duration must be non-negative",
      );
    }
    this.provider = options.provider;
    this.rules = options.rules ?? DEFAULT_TOWN_WEATHER_RULES;
    this.anchors = options.anchors ?? TOWN_WEATHER_ANCHORS;
    this.timeoutMs = options.timeoutMs ?? TOWN_WEATHER_DEFAULT_TIMEOUT_MS;
    this.lastKnownGoodMs = options.lastKnownGoodMs ??
      TOWN_WEATHER_LAST_KNOWN_GOOD_MS;
    this.clock = options.clock ?? Date.now;
    this.onProviderError = options.onProviderError;
  }

  get providerConfigured(): boolean {
    return this.provider !== undefined;
  }

  async getTownWeather(
    townId: TownWeatherTownId,
    now = this.clock(),
  ): Promise<TownWeatherSnapshot> {
    const anchor = this.anchors[townId];
    if (!anchor) throw new RangeError(`Unknown town weather anchor: ${townId}`);
    const validFrom = townWeatherBucketStart(now, anchor.utcOffsetMinutes);
    const key = bucketKey(townId, validFrom);
    const cached = this.cache.get(key);
    if (cached) return structuredClone(cached);

    const running = this.inFlight.get(key);
    if (running) return structuredClone(await running);

    const operation = this.resolveSnapshot(anchor, validFrom, now);
    this.inFlight.set(key, operation);
    try {
      const snapshot = await operation;
      this.cache.set(key, snapshot);
      this.prune(now);
      return structuredClone(snapshot);
    } finally {
      if (this.inFlight.get(key) === operation) this.inFlight.delete(key);
    }
  }

  clearCache(townId?: TownWeatherTownId): void {
    if (!townId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${townId}:`)) this.cache.delete(key);
    }
  }

  private async resolveSnapshot(
    anchor: TownWeatherAnchor,
    validFrom: number,
    now: number,
  ): Promise<TownWeatherSnapshot> {
    if (!this.provider) {
      return deterministicFallback(
        anchor,
        validFrom,
        now,
        "provider_disabled",
      );
    }

    try {
      const result = validateProviderResult(
        await this.fetchWithTimeout(anchor),
      );
      this.lastKnownGood.set(anchor.townId, {
        result: structuredClone(result),
        fetchedAt: now,
      });
      return providerSnapshot({
        result,
        anchor,
        rules: this.rules,
        validFrom,
        fetchedAt: now,
        source: "qweather",
      });
    } catch (error) {
      this.onProviderError?.(error, anchor.townId);
      const reason = fallbackReason(error);
      const previous = this.lastKnownGood.get(anchor.townId);
      if (
        previous &&
        now >= previous.fetchedAt &&
        now - previous.fetchedAt <= this.lastKnownGoodMs
      ) {
        return providerSnapshot({
          result: previous.result,
          anchor,
          rules: this.rules,
          validFrom,
          fetchedAt: now,
          source: "last_known_good",
          fallbackReason: reason,
        });
      }
      return deterministicFallback(anchor, validFrom, now, reason);
    }
  }

  private async fetchWithTimeout(
    anchor: TownWeatherAnchor,
  ): Promise<TownWeatherProviderResult> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new TownWeatherTimeoutError());
      }, this.timeoutMs);
      timeout.unref?.();
    });
    try {
      return await Promise.race([
        this.provider!.fetchTownWeather(anchor, controller.signal),
        timeoutPromise,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private prune(now: number): void {
    const cutoff = now - Math.max(
      this.lastKnownGoodMs,
      TOWN_WEATHER_BUCKET_MS * 2,
    );
    for (const [key, snapshot] of this.cache) {
      if (snapshot.validUntil < cutoff) this.cache.delete(key);
    }
  }
}

export function createTownWeatherService(
  config?: QWeatherProviderConfig & { readonly timeoutMs?: number },
  options: Omit<TownWeatherServiceOptions, "provider" | "timeoutMs"> & {
    readonly fetcher?: FetchLike;
  } = {},
): TownWeatherService {
  const { fetcher, ...serviceOptions } = options;
  return new TownWeatherService({
    ...serviceOptions,
    ...(config
      ? {
          provider: new QWeatherProvider(config, fetcher),
          timeoutMs: config.timeoutMs,
        }
      : {}),
  });
}
