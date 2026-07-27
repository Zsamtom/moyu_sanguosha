import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { Pool } from "pg";
import { BotDecisionRegistry } from "./bots/decision-registry.js";
import { OpenAiCompatibleDoudizhuProvider } from "./bots/doudizhu-llm.js";
import type { AppConfig } from "./config.js";

export const DEEPSEEK_CHAT_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_MODELS_ENDPOINT = "https://api.deepseek.com/models";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_MODELS = [
  DEFAULT_DEEPSEEK_MODEL,
  "deepseek-v4-pro",
] as const;

export type DeepSeekModel = string;

export interface PublicLlmSettings {
  readonly provider: "deepseek";
  readonly enabled: boolean;
  readonly endpoint: typeof DEEPSEEK_CHAT_ENDPOINT;
  readonly model: DeepSeekModel;
  readonly apiKeyConfigured: boolean;
  readonly thinkingEnabled: boolean;
  readonly timeoutMs: number;
  readonly maximumOutputTokens: number;
  readonly updatedAt: string | null;
}

export interface UpdateLlmSettingsInput {
  readonly enabled: boolean;
  readonly model: DeepSeekModel;
  readonly apiKey?: string;
  readonly clearApiKey?: boolean;
  readonly thinkingEnabled: boolean;
  readonly timeoutMs: number;
  readonly maximumOutputTokens: number;
}

export interface LlmConnectionTestResult {
  readonly ok: true;
  readonly provider: "deepseek";
  readonly model: DeepSeekModel;
  readonly latencyMs: number;
}

interface EncryptedValue {
  readonly algorithm: "aes-256-gcm";
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
}

export interface PersistedLlmSettings {
  readonly version: 1;
  readonly enabled: boolean;
  readonly provider: "deepseek";
  readonly endpoint: typeof DEEPSEEK_CHAT_ENDPOINT;
  readonly model: DeepSeekModel;
  readonly encryptedApiKey?: EncryptedValue;
  readonly thinkingEnabled: boolean;
  readonly timeoutMs: number;
  readonly maximumOutputTokens: number;
  /** Legacy v1 field retained only so older rows remain structurally readable. */
  readonly maximumPromptTokensPerGame?: number;
}

export interface LoadedLlmSettings {
  readonly settings: PersistedLlmSettings;
  readonly updatedAt: string;
}

export interface LlmSettingsStore {
  load(): Promise<LoadedLlmSettings | undefined>;
  save(settings: PersistedLlmSettings, updatedBy: string): Promise<string>;
}

export class PostgresLlmSettingsStore implements LlmSettingsStore {
  constructor(private readonly pool: Pool) {}

  async load(): Promise<LoadedLlmSettings | undefined> {
    const result = await this.pool.query<{
      value: PersistedLlmSettings;
      updated_at: Date | string;
    }>(
      `SELECT value, updated_at
       FROM app_settings
       WHERE key = $1`,
      ["doudizhu.llm"],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      settings: row.value,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async save(settings: PersistedLlmSettings, updatedBy: string): Promise<string> {
    const result = await this.pool.query<{ updated_at: Date | string }>(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
       RETURNING updated_at`,
      ["doudizhu.llm", JSON.stringify(settings), updatedBy],
    );
    return new Date(result.rows[0]!.updated_at).toISOString();
  }
}

export class MemoryLlmSettingsStore implements LlmSettingsStore {
  private loaded?: LoadedLlmSettings;

  async load(): Promise<LoadedLlmSettings | undefined> {
    return this.loaded ? structuredClone(this.loaded) : undefined;
  }

  async save(settings: PersistedLlmSettings): Promise<string> {
    const updatedAt = new Date().toISOString();
    this.loaded = { settings: structuredClone(settings), updatedAt };
    return updatedAt;
  }
}

interface RuntimeLlmSettings {
  enabled: boolean;
  model: DeepSeekModel;
  apiKey?: string;
  thinkingEnabled: boolean;
  timeoutMs: number;
  maximumOutputTokens: number;
  updatedAt: string | null;
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256")
    .update("sanguosha-online:llm-settings:v1:")
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
    throw new Error(`Unsupported LLM API key encryption: ${value.algorithm}`);
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

function isDeepSeekModel(value: string): value is DeepSeekModel {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

type FetchLike = typeof fetch;

export class LlmSettingsService {
  private current: RuntimeLlmSettings;

  constructor(
    private readonly store: LlmSettingsStore,
    private readonly registry: BotDecisionRegistry,
    private readonly secret: string,
    bootstrap?: AppConfig["doudizhuLlm"],
    private readonly fetcher: FetchLike = fetch,
  ) {
    const bootstrapModel = bootstrap && isDeepSeekModel(bootstrap.model)
      ? bootstrap.model
      : undefined;
    const deepSeekBootstrap = bootstrap && bootstrapModel &&
      new URL(bootstrap.endpoint).origin === "https://api.deepseek.com"
      ? { ...bootstrap, model: bootstrapModel }
      : undefined;
    this.current = {
      enabled: Boolean(deepSeekBootstrap),
      model: deepSeekBootstrap
        ? deepSeekBootstrap.model
        : DEFAULT_DEEPSEEK_MODEL,
      ...(deepSeekBootstrap?.apiKey ? { apiKey: deepSeekBootstrap.apiKey } : {}),
      thinkingEnabled: false,
      timeoutMs: deepSeekBootstrap?.timeoutMs ?? 4_000,
      maximumOutputTokens: deepSeekBootstrap?.maximumOutputTokens ?? 16,
      updatedAt: null,
    };
  }

  async initialize(): Promise<void> {
    const loaded = await this.store.load();
    if (loaded) {
      const { settings } = loaded;
      this.current = {
        enabled: settings.enabled,
        model: isDeepSeekModel(settings.model)
          ? settings.model
          : DEFAULT_DEEPSEEK_MODEL,
        ...(settings.encryptedApiKey
          ? { apiKey: decryptApiKey(settings.encryptedApiKey, this.secret) }
          : {}),
        thinkingEnabled: settings.thinkingEnabled,
        timeoutMs: settings.timeoutMs,
        maximumOutputTokens: settings.maximumOutputTokens,
        updatedAt: loaded.updatedAt,
      };
    }
    this.applyProvider();
  }

  getPublicSettings(): PublicLlmSettings {
    return {
      provider: "deepseek",
      enabled: this.current.enabled,
      endpoint: DEEPSEEK_CHAT_ENDPOINT,
      model: this.current.model,
      apiKeyConfigured: Boolean(this.current.apiKey),
      thinkingEnabled: this.current.thinkingEnabled,
      timeoutMs: this.current.timeoutMs,
      maximumOutputTokens: this.current.maximumOutputTokens,
      updatedAt: this.current.updatedAt,
    };
  }

  async update(
    input: UpdateLlmSettingsInput,
    updatedBy: string,
  ): Promise<PublicLlmSettings> {
    const suppliedApiKey = input.apiKey?.trim();
    const apiKey = input.clearApiKey
      ? undefined
      : suppliedApiKey || this.current.apiKey;
    if (input.enabled && !apiKey) {
      throw new Error("LLM_API_KEY_REQUIRED");
    }

    const next: RuntimeLlmSettings = {
      enabled: input.enabled,
      model: input.model.trim(),
      ...(apiKey ? { apiKey } : {}),
      thinkingEnabled: input.thinkingEnabled,
      timeoutMs: input.timeoutMs,
      maximumOutputTokens: input.maximumOutputTokens,
      updatedAt: null,
    };
    const persisted: PersistedLlmSettings = {
      version: 1,
      enabled: next.enabled,
      provider: "deepseek",
      endpoint: DEEPSEEK_CHAT_ENDPOINT,
      model: next.model,
      ...(next.apiKey
        ? { encryptedApiKey: encryptApiKey(next.apiKey, this.secret) }
        : {}),
      thinkingEnabled: next.thinkingEnabled,
      timeoutMs: next.timeoutMs,
      maximumOutputTokens: next.maximumOutputTokens,
    };
    next.updatedAt = await this.store.save(persisted, updatedBy);
    this.current = next;
    this.applyProvider();
    return this.getPublicSettings();
  }

  async testConnection(
    apiKeyInput?: string,
    modelInput?: DeepSeekModel,
  ): Promise<LlmConnectionTestResult> {
    const apiKey = apiKeyInput?.trim() || this.current.apiKey;
    if (!apiKey) throw new Error("LLM_API_KEY_REQUIRED");
    const model = modelInput?.trim() || this.current.model;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.current.timeoutMs,
    );
    timeout.unref();
    const startedAt = Date.now();
    try {
      const response = await this.fetcher(DEEPSEEK_MODELS_ENDPOINT, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DeepSeek connection failed with HTTP ${response.status}`);
      }
      const payload = await response.json() as {
        data?: Array<{ id?: unknown }>;
      };
      const models = Array.isArray(payload.data)
        ? payload.data.flatMap((model) =>
            typeof model.id === "string" ? [model.id] : []
          )
        : [];
      if (!models.includes(model)) {
        throw new Error(`${model} is not available for this API key`);
      }
      return {
        ok: true,
        provider: "deepseek",
        model,
        latencyMs: Math.max(0, Date.now() - startedAt),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private applyProvider(): void {
    if (!this.current.enabled || !this.current.apiKey) {
      this.registry.unregister("doudizhu");
      return;
    }
    this.registry.register(
      "doudizhu",
      new OpenAiCompatibleDoudizhuProvider({
        endpoint: DEEPSEEK_CHAT_ENDPOINT,
        apiKey: this.current.apiKey,
        model: this.current.model,
        timeoutMs: this.current.timeoutMs,
        maximumOutputTokens: this.current.maximumOutputTokens,
        thinkingEnabled: this.current.thinkingEnabled,
        jsonOutput: true,
      }),
    );
  }
}
