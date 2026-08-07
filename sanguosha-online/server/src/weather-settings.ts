import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import {
  QWeatherProvider,
  TOWN_WEATHER_ANCHORS,
  TOWN_WEATHER_DEFAULT_TIMEOUT_MS,
  TOWN_WEATHER_TOWN_IDS,
  type TownWeatherAnchor,
  type TownWeatherService,
  type TownWeatherTownId,
} from "./town-weather.js";

export const DEFAULT_TOWN_WEATHER_FORECAST_DAYS = 3;

export interface TownWeatherLocationSettings {
  readonly realCityName: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface PublicTownWeatherSettings {
  readonly provider: "qweather";
  readonly enabled: boolean;
  readonly apiHost: string;
  readonly apiKeyConfigured: boolean;
  readonly timeoutMs: number;
  readonly forecastDays: number;
  readonly towns: Readonly<
    Record<TownWeatherTownId, TownWeatherLocationSettings>
  >;
  readonly updatedAt: string | null;
}

export interface UpdateTownWeatherSettingsInput {
  readonly enabled: boolean;
  readonly apiHost: string;
  readonly apiKey?: string;
  readonly clearApiKey?: boolean;
  readonly timeoutMs: number;
  readonly forecastDays: number;
  readonly towns: Readonly<
    Record<TownWeatherTownId, TownWeatherLocationSettings>
  >;
}

export interface TownWeatherConnectionTestResult {
  readonly ok: true;
  readonly provider: "qweather";
  readonly latencyMs: number;
  readonly towns: readonly {
    readonly townId: TownWeatherTownId;
    readonly cityName: string;
    readonly conditionText: string;
    readonly forecastDayCount: number;
  }[];
}

interface EncryptedValue {
  readonly algorithm: "aes-256-gcm";
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
}

export interface PersistedTownWeatherSettings {
  readonly version: 1;
  readonly enabled: boolean;
  readonly provider: "qweather";
  readonly apiHost: string;
  readonly encryptedApiKey?: EncryptedValue;
  readonly timeoutMs: number;
  readonly forecastDays: number;
  readonly towns: Readonly<
    Record<TownWeatherTownId, TownWeatherLocationSettings>
  >;
}

export interface LoadedTownWeatherSettings {
  readonly settings: PersistedTownWeatherSettings;
  readonly updatedAt: string;
}

export interface TownWeatherSettingsStore {
  load(): Promise<LoadedTownWeatherSettings | undefined>;
  save(
    settings: PersistedTownWeatherSettings,
    updatedBy?: string,
  ): Promise<string>;
}

export class PostgresTownWeatherSettingsStore
  implements TownWeatherSettingsStore {
  constructor(private readonly pool: Pool) {}

  async load(): Promise<LoadedTownWeatherSettings | undefined> {
    const result = await this.pool.query<{
      value: PersistedTownWeatherSettings;
      updated_at: Date | string;
    }>(
      `SELECT value, updated_at
       FROM app_settings
       WHERE key = $1`,
      ["homestead.weather"],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      settings: row.value,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async save(
    settings: PersistedTownWeatherSettings,
    updatedBy?: string,
  ): Promise<string> {
    const result = await this.pool.query<{ updated_at: Date | string }>(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
       RETURNING updated_at`,
      ["homestead.weather", JSON.stringify(settings), updatedBy],
    );
    return new Date(result.rows[0]!.updated_at).toISOString();
  }
}

export class MemoryTownWeatherSettingsStore
  implements TownWeatherSettingsStore {
  private loaded?: LoadedTownWeatherSettings;

  async load(): Promise<LoadedTownWeatherSettings | undefined> {
    return this.loaded ? structuredClone(this.loaded) : undefined;
  }

  async save(settings: PersistedTownWeatherSettings): Promise<string> {
    const updatedAt = new Date().toISOString();
    this.loaded = { settings: structuredClone(settings), updatedAt };
    return updatedAt;
  }
}

interface RuntimeTownWeatherSettings {
  enabled: boolean;
  apiHost: string;
  apiKey?: string;
  timeoutMs: number;
  forecastDays: number;
  towns: Record<TownWeatherTownId, TownWeatherLocationSettings>;
  updatedAt: string | null;
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256")
    .update("sanguosha-online:weather-settings:v1:")
    .update(secret)
    .digest();
}

function encryptApiKey(apiKey: string, secret: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptApiKey(value: EncryptedValue, secret: string): string {
  if (value.algorithm !== "aes-256-gcm") {
    throw new Error(`Unsupported weather API key encryption: ${value.algorithm}`);
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

type SettingsEncryptionKeyring = string | {
  readonly current: string;
  readonly previous?: readonly string[];
};

function defaultTownSettings(): Record<
  TownWeatherTownId,
  TownWeatherLocationSettings
> {
  return Object.fromEntries(
    TOWN_WEATHER_TOWN_IDS.map((townId) => {
      const anchor = TOWN_WEATHER_ANCHORS[townId];
      return [townId, {
        realCityName: anchor.realCityName,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
      }];
    }),
  ) as Record<TownWeatherTownId, TownWeatherLocationSettings>;
}

export function normalizeQWeatherApiHost(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("QWEATHER_API_HOST_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".qweatherapi.com") ||
    url.port !== "" ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("QWEATHER_API_HOST_INVALID");
  }
  return url.origin;
}

function anchorsFor(
  towns: Readonly<Record<TownWeatherTownId, TownWeatherLocationSettings>>,
): Record<TownWeatherTownId, TownWeatherAnchor> {
  return Object.fromEntries(
    TOWN_WEATHER_TOWN_IDS.map((townId) => [townId, {
      ...TOWN_WEATHER_ANCHORS[townId],
      realCityName: towns[townId].realCityName.trim(),
      latitude: towns[townId].latitude,
      longitude: towns[townId].longitude,
    }]),
  ) as Record<TownWeatherTownId, TownWeatherAnchor>;
}

type FetchLike = typeof fetch;

export class TownWeatherSettingsService {
  private current: RuntimeTownWeatherSettings;
  private readonly secret: string;
  private readonly decryptionSecrets: readonly string[];

  constructor(
    private readonly store: TownWeatherSettingsStore,
    private readonly weather: TownWeatherService,
    encryption: SettingsEncryptionKeyring,
    bootstrap?: AppConfig["townWeather"],
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.secret = typeof encryption === "string" ? encryption : encryption.current;
    this.decryptionSecrets = [
      this.secret,
      ...(typeof encryption === "string" ? [] : encryption.previous ?? []),
    ].filter((value, index, values) => values.indexOf(value) === index);
    this.current = {
      enabled: Boolean(bootstrap),
      apiHost: bootstrap?.apiHost ?? "",
      ...(bootstrap?.apiKey ? { apiKey: bootstrap.apiKey } : {}),
      timeoutMs: bootstrap?.timeoutMs ?? TOWN_WEATHER_DEFAULT_TIMEOUT_MS,
      forecastDays: bootstrap?.forecastDays ??
        DEFAULT_TOWN_WEATHER_FORECAST_DAYS,
      towns: defaultTownSettings(),
      updatedAt: null,
    };
  }

  async initialize(): Promise<void> {
    const loaded = await this.store.load();
    if (loaded) {
      const settings = loaded.settings;
      if (settings.version !== 1 || settings.provider !== "qweather") {
        throw new Error("Unsupported town weather settings version");
      }
      let apiKey: string | undefined;
      let decryptedWithPreviousKey = false;
      if (settings.encryptedApiKey) {
        let lastError: unknown;
        for (const [index, secret] of this.decryptionSecrets.entries()) {
          try {
            apiKey = decryptApiKey(settings.encryptedApiKey, secret);
            decryptedWithPreviousKey = index > 0;
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!apiKey) {
          throw new Error("Stored weather API key cannot be decrypted with the configured keyring", {
            cause: lastError,
          });
        }
      }
      this.current = {
        enabled: settings.enabled,
        apiHost: settings.apiHost
          ? normalizeQWeatherApiHost(settings.apiHost)
          : "",
        ...(apiKey ? { apiKey } : {}),
        timeoutMs: settings.timeoutMs,
        forecastDays: settings.forecastDays,
        towns: structuredClone(settings.towns),
        updatedAt: loaded.updatedAt,
      };
      if (apiKey && decryptedWithPreviousKey) {
        this.current.updatedAt = await this.store.save({
          ...settings,
          encryptedApiKey: encryptApiKey(apiKey, this.secret),
        });
      }
    }
    this.applyProvider();
  }

  getPublicSettings(): PublicTownWeatherSettings {
    return {
      provider: "qweather",
      enabled: this.current.enabled,
      apiHost: this.current.apiHost,
      apiKeyConfigured: Boolean(this.current.apiKey),
      timeoutMs: this.current.timeoutMs,
      forecastDays: this.current.forecastDays,
      towns: structuredClone(this.current.towns),
      updatedAt: this.current.updatedAt,
    };
  }

  async update(
    input: UpdateTownWeatherSettingsInput,
    updatedBy: string,
  ): Promise<PublicTownWeatherSettings> {
    const suppliedApiKey = input.apiKey?.trim();
    const apiKey = input.clearApiKey
      ? undefined
      : suppliedApiKey || this.current.apiKey;
    const apiHost = input.apiHost.trim()
      ? normalizeQWeatherApiHost(input.apiHost)
      : "";
    if (input.enabled && !apiHost) throw new Error("QWEATHER_API_HOST_REQUIRED");
    if (input.enabled && !apiKey) throw new Error("QWEATHER_API_KEY_REQUIRED");
    const next: RuntimeTownWeatherSettings = {
      enabled: input.enabled,
      apiHost,
      ...(apiKey ? { apiKey } : {}),
      timeoutMs: input.timeoutMs,
      forecastDays: input.forecastDays,
      towns: structuredClone(input.towns),
      updatedAt: null,
    };
    const persisted: PersistedTownWeatherSettings = {
      version: 1,
      enabled: next.enabled,
      provider: "qweather",
      apiHost: next.apiHost,
      ...(next.apiKey
        ? { encryptedApiKey: encryptApiKey(next.apiKey, this.secret) }
        : {}),
      timeoutMs: next.timeoutMs,
      forecastDays: next.forecastDays,
      towns: structuredClone(next.towns),
    };
    next.updatedAt = await this.store.save(persisted, updatedBy);
    this.current = next;
    this.applyProvider();
    return this.getPublicSettings();
  }

  async testConnection(input: {
    readonly apiHost?: string;
    readonly apiKey?: string;
    readonly timeoutMs?: number;
    readonly forecastDays?: number;
    readonly towns?: Readonly<
      Record<TownWeatherTownId, TownWeatherLocationSettings>
    >;
  } = {}): Promise<TownWeatherConnectionTestResult> {
    const apiHost = normalizeQWeatherApiHost(
      input.apiHost?.trim() || this.current.apiHost,
    );
    const apiKey = input.apiKey?.trim() || this.current.apiKey;
    if (!apiKey) throw new Error("QWEATHER_API_KEY_REQUIRED");
    const timeoutMs = input.timeoutMs ?? this.current.timeoutMs;
    const forecastDays = input.forecastDays ?? this.current.forecastDays;
    const towns = input.towns ?? this.current.towns;
    const provider = new QWeatherProvider(
      { apiHost, apiKey, forecastDays },
      this.fetcher,
      timeoutMs,
    );
    const anchors = anchorsFor(towns);
    const startedAt = Date.now();
    const results = await Promise.all(
      TOWN_WEATHER_TOWN_IDS.map(async (townId) => {
        const result = await provider.fetchTownWeather(
          anchors[townId],
          new AbortController().signal,
        );
        if (
          result.forecastAvailable === false ||
          (result.forecast?.length ?? 0) === 0
        ) {
          throw new Error("QWEATHER_FORECAST_UNAVAILABLE");
        }
        return {
          townId,
          cityName: anchors[townId].realCityName,
          conditionText: result.conditionText,
          forecastDayCount: result.forecast?.length ?? 0,
        };
      }),
    );
    return {
      ok: true,
      provider: "qweather",
      latencyMs: Math.max(0, Date.now() - startedAt),
      towns: results,
    };
  }

  private applyProvider(): void {
    const anchors = anchorsFor(this.current.towns);
    const provider = this.current.enabled && this.current.apiHost &&
        this.current.apiKey
      ? new QWeatherProvider(
          {
            apiHost: this.current.apiHost,
            apiKey: this.current.apiKey,
            forecastDays: this.current.forecastDays,
          },
          this.fetcher,
          this.current.timeoutMs,
        )
      : undefined;
    this.weather.configure({
      provider,
      anchors,
      timeoutMs: this.current.timeoutMs,
    });
  }
}
