import { describe, expect, it, vi } from "vitest";
import {
  QWeatherProvider,
  TownWeatherService,
  createTownWeatherService,
  townWeatherBucketStart,
  type TownWeatherProvider,
  type TownWeatherProviderAlert,
  type TownWeatherProviderResult,
} from "./town-weather.js";

const localMidnight = Date.parse("2026-07-30T00:00:00+08:00");

function alert(
  overrides: Partial<TownWeatherProviderAlert> = {},
): TownWeatherProviderAlert {
  return {
    id: "warning-1",
    eventCode: "1003",
    eventName: "暴雨",
    headline: "暴雨黄色预警",
    description: "预计当地有强降雨。",
    instruction: "注意排水。",
    senderName: "测试气象台",
    messageType: "alert",
    severity: "moderate",
    certainty: "likely",
    urgency: "expected",
    colorCode: "yellow",
    issuedAt: localMidnight,
    effectiveAt: localMidnight,
    expiresAt: localMidnight + 12 * 60 * 60 * 1_000,
    ...overrides,
  };
}

function providerResult(
  overrides: Partial<TownWeatherProviderResult> = {},
): TownWeatherProviderResult {
  return {
    provider: "qweather",
    observedAt: localMidnight,
    conditionCode: "305",
    conditionText: "小雨",
    temperatureC: 22,
    feelsLikeC: 23,
    humidityPercent: 75,
    precipitationMm: 0.8,
    windSpeedKph: 9,
    visibilityKm: 12,
    alerts: [],
    attributions: ["QWeather"],
    ...overrides,
  };
}

function provider(
  implementation: TownWeatherProvider["fetchTownWeather"],
): TownWeatherProvider {
  return { fetchTownWeather: vi.fn(implementation) };
}

describe("town weather buckets and caching", () => {
  it("uses local 00:00, 08:00 and 16:00 boundaries", () => {
    expect(townWeatherBucketStart(localMidnight - 1))
      .toBe(Date.parse("2026-07-29T16:00:00+08:00"));
    expect(townWeatherBucketStart(localMidnight)).toBe(localMidnight);
    expect(townWeatherBucketStart(localMidnight + 8 * 60 * 60 * 1_000 - 1))
      .toBe(localMidnight);
    expect(townWeatherBucketStart(localMidnight + 8 * 60 * 60 * 1_000))
      .toBe(localMidnight + 8 * 60 * 60 * 1_000);
  });

  it("caches one immutable game snapshot per town and eight-hour bucket", async () => {
    const source = provider(async () => providerResult());
    const service = new TownWeatherService({ provider: source });

    const first = await service.getTownWeather("greenvale", localMidnight);
    (first.observation as { conditionText: string }).conditionText =
      "被调用方篡改";
    const second = await service.getTownWeather(
      "greenvale",
      localMidnight + 7 * 60 * 60 * 1_000,
    );
    await service.getTownWeather(
      "greenvale",
      localMidnight + 8 * 60 * 60 * 1_000,
    );

    expect(source.fetchTownWeather).toHaveBeenCalledTimes(2);
    expect(second.observation.conditionText).toBe("小雨");
    expect(first.validUntil - first.validFrom).toBe(8 * 60 * 60 * 1_000);
  });

  it("coalesces concurrent requests for the same town bucket", async () => {
    let release!: (value: TownWeatherProviderResult) => void;
    const source = provider(
      async () =>
        await new Promise<TownWeatherProviderResult>((resolve) => {
          release = resolve;
        }),
    );
    const service = new TownWeatherService({ provider: source });

    const requests = Array.from(
      { length: 20 },
      () => service.getTownWeather("frostpeak", localMidnight),
    );
    await Promise.resolve();
    expect(source.fetchTownWeather).toHaveBeenCalledTimes(1);
    release(providerResult({ temperatureC: -8, conditionText: "小雪" }));

    const snapshots = await Promise.all(requests);
    expect(snapshots.every(({ weatherId }) => weatherId === "frost")).toBe(
      true,
    );
  });

  it("keeps Greenvale and Frostpeak snapshots independent", async () => {
    const source = provider(async (anchor) =>
      providerResult(
        anchor.townId === "greenvale"
          ? {
              temperatureC: 25,
              conditionCode: "100",
              conditionText: "晴",
              precipitationMm: 0,
            }
          : { temperatureC: -10, conditionText: "雪" },
      )
    );
    const service = new TownWeatherService({ provider: source });

    const [greenvale, frostpeak] = await Promise.all([
      service.getTownWeather("greenvale", localMidnight),
      service.getTownWeather("frostpeak", localMidnight),
    ]);

    expect(source.fetchTownWeather).toHaveBeenCalledTimes(2);
    expect(greenvale.anchor.realCityName).toBe("成都");
    expect(greenvale.weatherId).toBe("clear");
    expect(frostpeak.anchor.realCityName).toBe("香格里拉");
    expect(frostpeak.weatherId).toBe("frost");
  });
});

describe("town weather failure isolation", () => {
  it("times out even when an injected provider ignores AbortSignal", async () => {
    const source = provider(async () => await new Promise(() => undefined));
    const service = new TownWeatherService({
      provider: source,
      timeoutMs: 5,
    });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(snapshot).toMatchObject({
      source: "deterministic_fallback",
      stale: true,
      mechanicsEnabled: false,
      weatherId: "clear",
      disasters: [],
      fallbackReason: "provider_timeout",
    });
  });

  it("uses a successful snapshot for at most 72 hours", async () => {
    const source = provider(
      vi.fn()
        .mockResolvedValueOnce(providerResult({ alerts: [alert()] }))
        .mockRejectedValue(new Error("provider unavailable")),
    );
    const service = new TownWeatherService({ provider: source });

    const live = await service.getTownWeather("greenvale", localMidnight);
    const recent = await service.getTownWeather(
      "greenvale",
      localMidnight + 8 * 60 * 60 * 1_000,
    );
    const expired = await service.getTownWeather(
      "greenvale",
      localMidnight + 80 * 60 * 60 * 1_000,
    );

    expect(live.source).toBe("qweather");
    expect(recent).toMatchObject({
      source: "last_known_good",
      stale: true,
      mechanicsEnabled: false,
      weatherId: "gentle_rain",
      fallbackReason: "provider_error",
    });
    expect(recent.disasters[0]?.affectsGameplay).toBe(false);
    expect(expired).toMatchObject({
      source: "deterministic_fallback",
      mechanicsEnabled: false,
      disasters: [],
    });
  });

  it("never calls fetch when QWeather is not configured", async () => {
    const fetcher = vi.fn();
    const service = createTownWeatherService(undefined, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(fetcher).not.toHaveBeenCalled();
    expect(service.providerConfigured).toBe(false);
    expect(snapshot.fallbackReason).toBe("provider_disabled");
  });
});

describe("QWeather normalization", () => {
  it("loads current conditions and warnings using the configured API host", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/v7/weather/now")) {
        return new Response(JSON.stringify({
          code: "200",
          now: {
            obsTime: "2026-07-30T00:00+08:00",
            temp: "36",
            feelsLike: "40",
            icon: "100",
            text: "晴",
            windSpeed: "12",
            humidity: "48",
            precip: "0.0",
            vis: "20",
          },
          refer: {
            sources: ["https://example.test/source"],
            license: ["QWeather Developers License"],
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        metadata: { attributions: ["天气预警来源"] },
        alerts: [{
          id: "alert-1",
          senderName: "成都市气象台",
          issuedTime: "2026-07-30T00:00+08:00",
          messageType: { code: "alert", supersedes: [] },
          eventType: { name: "暴雨", code: "1003" },
          urgency: "expected",
          severity: "severe",
          certainty: "likely",
          color: { code: "orange" },
          effectiveTime: "2026-07-30T00:00+08:00",
          expireTime: "2026-07-30T12:00+08:00",
          headline: "暴雨预警",
          description: "预计出现强降水。",
          instruction: "检查排水设施。",
        }],
      }), { status: 200 });
    });
    const service = createTownWeatherService({
      apiHost: "https://abcxyz.qweatherapi.com",
      apiKey: "secret",
    }, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(([, init]) =>
        (init?.headers as Record<string, string>)["X-QW-Api-Key"] === "secret"
      ),
    ).toBe(true);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "location=104.07%2C30.57",
    );
    expect(snapshot).toMatchObject({
      source: "qweather",
      weatherId: "heatwave",
      observation: {
        temperatureC: 36,
        conditionText: "晴",
      },
    });
    expect(snapshot.disasters[0]).toMatchObject({
      eventName: "暴雨",
      severity: 3,
      mechanicId: "mountain_seepage",
      affectsGameplay: true,
    });
    expect(snapshot.attributions).toContain("天气预警来源");
  });

  it("rejects malformed provider JSON and safely falls back", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      new Response(JSON.stringify(
        String(input).includes("/v7/weather/now")
          ? {
              code: "200",
              now: {
                obsTime: "not-a-date",
                temp: "not-a-number",
                feelsLike: "20",
                icon: "100",
                text: "晴",
                windSpeed: "2",
                humidity: "50",
                precip: "0",
                vis: "20",
              },
            }
          : { metadata: {}, alerts: [] },
      ), { status: 200 })
    );
    const service = createTownWeatherService({
      apiHost: "https://abcxyz.qweatherapi.com",
      apiKey: "secret",
    }, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(snapshot).toMatchObject({
      source: "deterministic_fallback",
      mechanicsEnabled: false,
      fallbackReason: "provider_error",
    });
  });

  it("keeps current weather when the warning endpoint is unavailable", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/v7/weather/now")) {
        return new Response(JSON.stringify({
          code: "200",
          now: {
            obsTime: "2026-07-30T00:00+08:00",
            temp: "24",
            feelsLike: "25",
            icon: "100",
            text: "晴",
            windSpeed: "5",
            humidity: "50",
            precip: "0",
            vis: "20",
          },
        }), { status: 200 });
      }
      return new Response("warning service unavailable", { status: 503 });
    });
    const service = createTownWeatherService({
      apiHost: "https://abcxyz.qweatherapi.com",
      apiKey: "secret",
    }, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(snapshot).toMatchObject({
      source: "qweather",
      mechanicsEnabled: true,
      alertsAvailable: false,
      disasters: [],
      weatherId: "clear",
    });
  });

  it("keeps current weather when the warning endpoint exceeds its independent timeout", async () => {
    let rejectLateWarning!: (reason: unknown) => void;
    const lateWarning = new Promise<Response>((_resolve, reject) => {
      rejectLateWarning = reject;
    });
    const fetcher = vi.fn(
      async (input: string | URL | Request): Promise<Response> => {
        if (String(input).includes("/v7/weather/now")) {
          return new Response(JSON.stringify({
            code: "200",
            now: {
              obsTime: "2026-07-30T00:00+08:00",
              temp: "24",
              feelsLike: "25",
              icon: "100",
              text: "晴",
              windSpeed: "5",
              humidity: "50",
              precip: "0",
              vis: "20",
            },
          }), { status: 200 });
        }
        return await lateWarning;
      },
    );
    const service = createTownWeatherService({
      apiHost: "https://abcxyz.qweatherapi.com",
      apiKey: "secret",
      timeoutMs: 40,
    }, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(snapshot).toMatchObject({
      source: "qweather",
      mechanicsEnabled: true,
      alertsAvailable: false,
      disasters: [],
      weatherId: "clear",
    });
    rejectLateWarning(new Error("late warning rejection"));
    await Promise.resolve();
  });

  it("does not enable mechanics for stale provider observations", async () => {
    const source = provider(async () =>
      providerResult({
        observedAt: localMidnight - 13 * 60 * 60 * 1_000,
      })
    );
    const service = new TownWeatherService({ provider: source });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(snapshot).toMatchObject({
      source: "deterministic_fallback",
      mechanicsEnabled: false,
      fallbackReason: "provider_error",
    });
  });

  it("keeps unknown alerts visible without enabling gameplay effects", async () => {
    const source = provider(async () =>
      providerResult({
        alerts: [
          alert({
            eventCode: "future-999",
            eventName: "尚未识别的新型预警",
            headline: "测试未知预警",
            description: "供应商未来新增的预警类型。",
          }),
        ],
      })
    );
    const service = new TownWeatherService({ provider: source });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(snapshot.disasters).toHaveLength(1);
    expect(snapshot.disasters[0]).toMatchObject({
      eventName: "尚未识别的新型预警",
      mechanicId: null,
      mechanicLabel: null,
      affectsGameplay: false,
    });
  });

  it("re-evaluates alert effective and expiry times inside a cached bucket", async () => {
    const source = provider(async () =>
      providerResult({
        alerts: [
          alert({
            id: "expires-early",
            expiresAt: localMidnight + 60 * 60 * 1_000,
          }),
          alert({
            id: "starts-later",
            effectiveAt: localMidnight + 2 * 60 * 60 * 1_000,
            expiresAt: localMidnight + 7 * 60 * 60 * 1_000,
          }),
        ],
      })
    );
    const service = new TownWeatherService({ provider: source });

    const initial = await service.getTownWeather("greenvale", localMidnight);
    const later = await service.getTownWeather(
      "greenvale",
      localMidnight + 3 * 60 * 60 * 1_000,
    );

    expect(source.fetchTownWeather).toHaveBeenCalledTimes(1);
    expect(initial.disasters.map(({ providerAlertId }) => providerAlertId))
      .toEqual(["expires-early"]);
    expect(later.disasters.map(({ providerAlertId }) => providerAlertId))
      .toEqual(["starts-later"]);
  });

  it("orders simultaneous gameplay alerts by severity", async () => {
    const source = provider(async () =>
      providerResult({
        alerts: [
          alert({ id: "minor", severity: "minor", colorCode: "yellow" }),
          alert({ id: "severe", severity: "severe", colorCode: "red" }),
        ],
      })
    );
    const service = new TownWeatherService({ provider: source });

    const snapshot = await service.getTownWeather(
      "greenvale",
      localMidnight,
    );

    expect(snapshot.disasters.map(({ providerAlertId }) => providerAlertId))
      .toEqual(["severe", "minor"]);
  });

  it("deduplicates provider alert IDs using severity and recency", async () => {
    const source = provider(async () =>
      providerResult({
        alerts: [
          alert({
            id: "duplicate",
            headline: "较旧的严重预警",
            severity: "severe",
            issuedAt: localMidnight,
          }),
          alert({
            id: "duplicate",
            headline: "较新的低级预警",
            severity: "minor",
            issuedAt: localMidnight + 2 * 60 * 60 * 1_000,
          }),
          alert({
            id: "duplicate",
            headline: "较新的严重预警",
            severity: "severe",
            issuedAt: localMidnight + 60 * 60 * 1_000,
          }),
          alert({
            id: "unique",
            headline: "另一条独立预警",
            severity: "moderate",
          }),
        ],
      })
    );
    const service = new TownWeatherService({ provider: source });

    const snapshot = await service.getTownWeather(
      "greenvale",
      localMidnight,
    );

    expect(snapshot.disasters).toHaveLength(2);
    expect(snapshot.disasters[0]).toMatchObject({
      providerAlertId: "duplicate",
      headline: "较新的严重预警",
      severity: 3,
    });
    expect(snapshot.disasters[1]?.providerAlertId).toBe("unique");
  });

  it("accepts injected normalization rules", async () => {
    const source = provider(async () =>
      providerResult({ alerts: [alert({ eventName: "任意预警" })] })
    );
    const service = new TownWeatherService({
      provider: source,
      rules: {
        resolveWeatherId: () => "frost",
        resolveDisaster: () => ({
          mechanicId: "hail",
          label: "测试规则",
        }),
      },
    });

    const snapshot = await service.getTownWeather("greenvale", localMidnight);

    expect(snapshot.weatherId).toBe("frost");
    expect(snapshot.disasters[0]).toMatchObject({
      mechanicId: "hail",
      mechanicLabel: "测试规则",
      affectsGameplay: true,
    });
  });
});

describe("QWeather provider payload validation", () => {
  it("exposes malformed responses as provider failures", async () => {
    const provider = new QWeatherProvider({
      apiHost: "https://abcxyz.qweatherapi.com",
      apiKey: "secret",
    }, vi.fn(async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 })
    ) as unknown as typeof fetch);

    await expect(provider.fetchTownWeather(
      {
        townId: "greenvale",
        fictionalName: "青禾镇",
        realCityName: "成都",
        latitude: 30.57,
        longitude: 104.07,
        timezone: "Asia/Shanghai",
        utcOffsetMinutes: 480,
      },
      new AbortController().signal,
    )).rejects.toThrow();
  });
});
