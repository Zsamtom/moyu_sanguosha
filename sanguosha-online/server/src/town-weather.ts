import { z } from "zod";

const HOUR_MS = 60 * 60 * 1_000;

export const TOWN_WEATHER_BUCKET_MS = 8 * HOUR_MS;
export const TOWN_WEATHER_DEFAULT_TIMEOUT_MS = 3_000;
export const TOWN_WEATHER_DEFAULT_ALERT_TIMEOUT_MS = 1_000;
export const TOWN_WEATHER_LAST_KNOWN_GOOD_MS = 72 * HOUR_MS;
export const TOWN_WEATHER_MAX_OBSERVATION_AGE_MS = 12 * HOUR_MS;
export const TOWN_WEATHER_MAX_CLOCK_SKEW_MS = HOUR_MS;

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
    realCityName: "郑州",
    latitude: 34.75,
    longitude: 113.62,
    timezone: "Asia/Shanghai",
    utcOffsetMinutes: 480,
  },
  frostpeak: {
    townId: "frostpeak",
    fictionalName: "霜岭镇",
    realCityName: "拉萨",
    latitude: 29.65,
    longitude: 91.1,
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
  readonly alertsAvailable?: boolean;
  readonly forecast?: readonly TownWeatherProviderForecastDay[];
  readonly forecastAvailable?: boolean;
  readonly attributions: readonly string[];
}

export interface TownWeatherProviderForecastDay {
  readonly forecastStartAt: number;
  readonly forecastEndAt: number;
  readonly conditionCode: string;
  readonly conditionText: string;
  readonly temperatureMinC: number;
  readonly temperatureMaxC: number;
  readonly precipitationMm: number;
  readonly precipitationProbabilityPercent: number;
  readonly humidityPercent: number;
  readonly windSpeedKph: number;
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

export interface NormalizedTownWeatherForecastDay {
  readonly forecastStartAt: number;
  readonly forecastEndAt: number;
  readonly weatherId: NormalizedTownWeatherId;
  readonly conditionCode: string;
  readonly conditionText: string;
  readonly temperatureMinC: number;
  readonly temperatureMaxC: number;
  readonly precipitationMm: number;
  readonly precipitationProbabilityPercent: number;
  readonly humidityPercent: number;
  readonly windSpeedKph: number;
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
  readonly alertsAvailable: boolean;
  readonly forecastAvailable: boolean;
  readonly forecast: readonly NormalizedTownWeatherForecastDay[];
  readonly disasters: readonly NormalizedTownWeatherDisaster[];
  readonly attributions: readonly string[];
  readonly fallbackReason: string | null;
}

export interface QWeatherProviderConfig {
  readonly apiHost: string;
  readonly apiKey: string;
  readonly forecastDays?: number;
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

const qWeatherMeasurementSchema = z.object({
  value: numericValue,
  unit: z.string().optional(),
}).passthrough();

const qWeatherDailyPeriodSchema = z.object({
  condition: z.object({
    text: z.string().min(1),
    code: z.string().min(1),
  }).passthrough(),
  wind: z.object({
    speed: qWeatherMeasurementSchema,
  }).passthrough(),
  precipitation: z.object({
    amount: qWeatherMeasurementSchema,
    probability: boundedNumber(0, 1),
  }).passthrough(),
  humidity: boundedNumber(0, 1),
}).passthrough();

const qWeatherDailySchema = z.object({
  metadata: z.object({
    attributions: z.array(z.string()).optional(),
  }).passthrough().optional(),
  days: z.array(z.object({
    forecastStartTime: z.string().min(1),
    forecastEndTime: z.string().min(1),
    temperatureMax: qWeatherMeasurementSchema,
    temperatureMin: qWeatherMeasurementSchema,
    daytime: qWeatherDailyPeriodSchema,
  }).passthrough()).min(1),
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

class TownWeatherTimeoutError extends Error {
  constructor() {
    super("Town weather provider timed out");
    this.name = "TownWeatherTimeoutError";
  }
}

export class QWeatherProvider implements TownWeatherProvider {
  private readonly apiHost: string;
  private readonly currentTimeoutMs: number;
  private readonly alertsTimeoutMs: number;
  private readonly forecastTimeoutMs: number;
  private readonly forecastDays: number;

  constructor(
    config: QWeatherProviderConfig,
    private readonly fetcher: FetchLike = fetch,
    totalTimeoutMs = TOWN_WEATHER_DEFAULT_TIMEOUT_MS,
  ) {
    if (!Number.isFinite(totalTimeoutMs) || totalTimeoutMs < 1) {
      throw new TypeError("QWeather total timeout must be a positive number");
    }
    this.apiHost = normalizedApiHost(config.apiHost);
    this.apiKey = config.apiKey;
    this.forecastDays = Math.max(
      1,
      Math.min(10, Math.floor(config.forecastDays ?? 3)),
    );
    this.currentTimeoutMs = totalTimeoutMs;
    this.alertsTimeoutMs = Math.min(
      TOWN_WEATHER_DEFAULT_ALERT_TIMEOUT_MS,
      Math.max(0, Math.floor(totalTimeoutMs / 2)),
    );
    this.forecastTimeoutMs = Math.max(1, Math.floor(totalTimeoutMs * 0.8));
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
    const dailyUrl = new URL(
      `/weather/v1/daily/${latitude}/${longitude}`,
      this.apiHost,
    );
    dailyUrl.searchParams.set("days", String(this.forecastDays));
    dailyUrl.searchParams.set("localTime", "true");
    dailyUrl.searchParams.set("lang", "zh");

    const [nowResult, alertsResult, dailyResult] = await Promise.allSettled([
      this.request(nowUrl, signal, this.currentTimeoutMs),
      this.request(alertsUrl, signal, this.alertsTimeoutMs),
      this.request(dailyUrl, signal, this.forecastTimeoutMs),
    ]);
    if (nowResult.status === "rejected") throw nowResult.reason;
    const current = qWeatherNowSchema.parse(nowResult.value);
    let alertsAvailable = alertsResult.status === "fulfilled";
    let warnings: z.infer<typeof qWeatherAlertsSchema> = {
      alerts: [],
    };
    if (alertsResult.status === "fulfilled") {
      const parsed = qWeatherAlertsSchema.safeParse(alertsResult.value);
      if (parsed.success) {
        warnings = parsed.data;
      } else {
        alertsAvailable = false;
      }
    }
    let forecastAvailable = dailyResult.status === "fulfilled";
    let daily: z.infer<typeof qWeatherDailySchema> | null = null;
    if (dailyResult.status === "fulfilled") {
      const parsed = qWeatherDailySchema.safeParse(dailyResult.value);
      if (parsed.success) {
        daily = parsed.data;
      } else {
        forecastAvailable = false;
      }
    }
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
      ...(daily?.metadata?.attributions ?? []),
    ]);

    const forecast = (daily?.days ?? []).flatMap((day) => {
      const forecastStartAt = parsedTimestamp(day.forecastStartTime);
      const forecastEndAt = parsedTimestamp(day.forecastEndTime);
      if (forecastStartAt === null || forecastEndAt === null) return [];
      const speedUnit = day.daytime.wind.speed.unit?.toLocaleLowerCase();
      const windSpeedKph = speedUnit === "m/s"
        ? day.daytime.wind.speed.value * 3.6
        : day.daytime.wind.speed.value;
      const probability = day.daytime.precipitation.probability;
      return [{
        forecastStartAt,
        forecastEndAt,
        conditionCode: day.daytime.condition.code,
        conditionText: day.daytime.condition.text,
        temperatureMinC: day.temperatureMin.value,
        temperatureMaxC: day.temperatureMax.value,
        precipitationMm: day.daytime.precipitation.amount.value,
        precipitationProbabilityPercent: Math.round(probability * 100),
        humidityPercent: Math.round(day.daytime.humidity * 100),
        windSpeedKph,
      }];
    });

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
      alertsAvailable,
      forecast,
      forecastAvailable,
      attributions: [...attributions],
    };
  }

  private async request(
    url: URL,
    parentSignal: AbortSignal,
    timeoutMs: number,
  ): Promise<unknown> {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new TownWeatherTimeoutError());
      }, timeoutMs);
      timeout.unref?.();
    });
    try {
      return await Promise.race([
        this.requestJson(url, controller.signal),
        timeoutPromise,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  }

  private async requestJson(
    url: URL,
    signal: AbortSignal,
  ): Promise<unknown> {
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
  now: number,
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
    (
      result.alertsAvailable !== undefined &&
      typeof result.alertsAvailable !== "boolean"
    ) ||
    (result.forecast !== undefined && !Array.isArray(result.forecast)) ||
    (
      result.forecastAvailable !== undefined &&
      typeof result.forecastAvailable !== "boolean"
    ) ||
    !Array.isArray(result.attributions)
  ) {
    throw new Error("Weather provider returned an invalid payload");
  }
  if (
    result.observedAt < now - TOWN_WEATHER_MAX_OBSERVATION_AGE_MS ||
    result.observedAt > now + TOWN_WEATHER_MAX_CLOCK_SKEW_MS
  ) {
    throw new Error("Weather provider returned a stale observation");
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
): NormalizedTownWeatherDisaster[] {
  const normalized = result.alerts
    .filter((alert) => alert.messageType?.toLocaleLowerCase() !== "cancel")
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
  const priority = (
    left: NormalizedTownWeatherDisaster,
    right: NormalizedTownWeatherDisaster,
  ): number =>
    right.severity - left.severity ||
    (right.issuedAt ?? -1) - (left.issuedAt ?? -1) ||
    (right.effectiveAt ?? -1) - (left.effectiveAt ?? -1) ||
    (right.expiresAt ?? -1) - (left.expiresAt ?? -1) ||
    left.providerAlertId.localeCompare(right.providerAlertId);
  const byProviderAlertId = new Map<
    string,
    NormalizedTownWeatherDisaster
  >();
  for (const disaster of normalized) {
    const existing = byProviderAlertId.get(disaster.providerAlertId);
    if (!existing || priority(disaster, existing) < 0) {
      byProviderAlertId.set(disaster.providerAlertId, disaster);
    }
  }
  return [...byProviderAlertId.values()].sort(priority);
}

function normalizedForecast(
  result: TownWeatherProviderResult,
  anchor: TownWeatherAnchor,
  rules: TownWeatherRules,
): NormalizedTownWeatherForecastDay[] {
  return (result.forecast ?? []).map((day) => ({
    ...structuredClone(day),
    weatherId: rules.resolveWeatherId({
      provider: result.provider,
      observedAt: day.forecastStartAt,
      conditionCode: day.conditionCode,
      conditionText: day.conditionText,
      temperatureC: day.temperatureMaxC,
      feelsLikeC: day.temperatureMaxC,
      humidityPercent: day.humidityPercent,
      precipitationMm: day.precipitationMm,
      windSpeedKph: day.windSpeedKph,
      visibilityKm: result.visibilityKm,
      alerts: [],
      alertsAvailable: false,
      forecast: [],
      forecastAvailable: false,
      attributions: [],
    }, anchor),
  }));
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
    mechanicsEnabled: source === "qweather",
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
    alertsAvailable: result.alertsAvailable !== false,
    forecastAvailable: result.forecastAvailable !== false,
    forecast: normalizedForecast(result, anchor, rules),
    disasters: normalizedDisasters(result, anchor, rules),
    attributions: [...result.attributions],
    fallbackReason: input.fallbackReason ?? null,
  };
}

function snapshotAt(
  snapshot: TownWeatherSnapshot,
  now: number,
): TownWeatherSnapshot {
  const currentDisasters = snapshot.disasters
    .filter((hazard) =>
      (hazard.effectiveAt === null || hazard.effectiveAt <= now) &&
      (hazard.expiresAt === null || hazard.expiresAt > now)
    )
    .map((hazard) => ({
      ...hazard,
      affectsGameplay:
        snapshot.mechanicsEnabled && hazard.affectsGameplay,
    }));
  return {
    ...structuredClone(snapshot),
    disasters: currentDisasters,
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
    alertsAvailable: false,
    forecastAvailable: false,
    forecast: [],
    disasters: [],
    attributions: [],
    fallbackReason: reason,
  };
}

function fallbackReason(error: unknown): string {
  if (error instanceof TownWeatherTimeoutError) return "provider_timeout";
  return "provider_error";
}

export class TownWeatherService {
  private provider?: TownWeatherProvider;
  private readonly rules: TownWeatherRules;
  private anchors: Readonly<
    Record<TownWeatherTownId, TownWeatherAnchor>
  >;
  private timeoutMs: number;
  private readonly lastKnownGoodMs: number;
  private readonly clock: () => number;
  private readonly onProviderError?: TownWeatherServiceOptions[
    "onProviderError"
  ];
  private readonly cache = new Map<string, TownWeatherSnapshot>();
  private readonly inFlight = new Map<string, Promise<TownWeatherSnapshot>>();
  private readonly lastKnownGood = new Map<TownWeatherTownId, LastKnownGood>();
  private configurationRevision = 0;

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

  configure(options: {
    readonly provider?: TownWeatherProvider;
    readonly anchors?: Readonly<Record<TownWeatherTownId, TownWeatherAnchor>>;
    readonly timeoutMs?: number;
  }): void {
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1)
    ) {
      throw new TypeError("Town weather timeout must be a positive number");
    }
    this.provider = options.provider;
    if (options.anchors) this.anchors = structuredClone(options.anchors);
    if (options.timeoutMs !== undefined) this.timeoutMs = options.timeoutMs;
    this.configurationRevision += 1;
    this.cache.clear();
    this.inFlight.clear();
    this.lastKnownGood.clear();
  }

  async getTownWeather(
    townId: TownWeatherTownId,
    now = this.clock(),
  ): Promise<TownWeatherSnapshot> {
    const anchor = this.anchors[townId];
    if (!anchor) throw new RangeError(`Unknown town weather anchor: ${townId}`);
    const revision = this.configurationRevision;
    const validFrom = townWeatherBucketStart(now, anchor.utcOffsetMinutes);
    const key = `${revision}|${bucketKey(townId, validFrom)}`;
    const cached = this.cache.get(key);
    if (cached) return snapshotAt(cached, now);

    const running = this.inFlight.get(key);
    if (running) return snapshotAt(await running, now);

    const operation = this.resolveSnapshot(
      anchor,
      validFrom,
      now,
      revision,
      this.provider,
    );
    this.inFlight.set(key, operation);
    try {
      const snapshot = await operation;
      if (this.configurationRevision === revision) {
        this.cache.set(key, snapshot);
        this.prune(now);
      }
      return snapshotAt(snapshot, now);
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
      if (key.includes(`|${townId}:`)) this.cache.delete(key);
    }
  }

  private async resolveSnapshot(
    anchor: TownWeatherAnchor,
    validFrom: number,
    now: number,
    configurationRevision: number,
    provider: TownWeatherProvider | undefined,
  ): Promise<TownWeatherSnapshot> {
    if (!provider) {
      return deterministicFallback(
        anchor,
        validFrom,
        now,
        "provider_disabled",
      );
    }

    try {
      const result = validateProviderResult(
        await this.fetchWithTimeout(anchor, provider),
        now,
      );
      if (this.configurationRevision === configurationRevision) {
        this.lastKnownGood.set(anchor.townId, {
          result: structuredClone(result),
          fetchedAt: now,
        });
      }
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
      const previous = this.configurationRevision === configurationRevision
        ? this.lastKnownGood.get(anchor.townId)
        : undefined;
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
    provider: TownWeatherProvider,
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
        provider.fetchTownWeather(anchor, controller.signal),
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
          provider: new QWeatherProvider(
            config,
            fetcher,
            config.timeoutMs ?? TOWN_WEATHER_DEFAULT_TIMEOUT_MS,
          ),
          timeoutMs: config.timeoutMs,
        }
      : {}),
  });
}
