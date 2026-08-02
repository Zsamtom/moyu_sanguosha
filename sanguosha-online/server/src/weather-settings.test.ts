import { describe, expect, it, vi } from "vitest";
import { TownWeatherService } from "./town-weather.js";
import {
  MemoryTownWeatherSettingsStore,
  TownWeatherSettingsService,
  normalizeQWeatherApiHost,
} from "./weather-settings.js";

function qweatherFetcher(options: { forecastFails?: boolean } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/v7/weather/now")) {
      return new Response(JSON.stringify({
        code: "200",
        now: {
          obsTime: "2026-07-30T08:00+08:00",
          temp: "24",
          feelsLike: "25",
          icon: "100",
          text: "晴",
          windSpeed: "8",
          humidity: "55",
          precip: "0",
          vis: "20",
        },
      }), { status: 200 });
    }
    if (url.includes("/weather/v1/daily/")) {
      if (options.forecastFails) {
        return new Response("forecast unavailable", { status: 403 });
      }
      return new Response(JSON.stringify({
        metadata: { attributions: ["QWeather"] },
        days: [{
          forecastStartTime: "2026-07-31T00:00+08:00",
          forecastEndTime: "2026-08-01T00:00+08:00",
          temperatureMax: { value: 29, unit: "°C" },
          temperatureMin: { value: 19, unit: "°C" },
          daytime: {
            condition: { text: "多云", code: "101" },
            wind: { speed: { value: 2, unit: "m/s" } },
            precipitation: {
              amount: { value: 0, unit: "mm" },
              probability: 0.2,
            },
            humidity: 0.6,
          },
        }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      metadata: { attributions: ["QWeather"] },
      alerts: [],
    }), { status: 200 });
  });
}

describe("town weather runtime settings", () => {
  it("defaults to Zhengzhou and Lhasa while remaining disabled", async () => {
    const service = new TownWeatherSettingsService(
      new MemoryTownWeatherSettingsStore(),
      new TownWeatherService(),
      "test-session-secret",
    );
    await service.initialize();

    expect(service.getPublicSettings()).toMatchObject({
      enabled: false,
      apiKeyConfigured: false,
      forecastDays: 3,
      towns: {
        greenvale: { realCityName: "郑州" },
        frostpeak: { realCityName: "拉萨" },
      },
    });
  });

  it("encrypts the key, hot-applies locations, and tests both towns", async () => {
    const store = new MemoryTownWeatherSettingsStore();
    const weather = new TownWeatherService();
    const fetcher = qweatherFetcher();
    const service = new TownWeatherSettingsService(
      store,
      weather,
      "test-session-secret",
      undefined,
      fetcher as unknown as typeof fetch,
    );
    await service.initialize();
    const settings = await service.update({
      enabled: true,
      apiHost: "https://abc123.qweatherapi.com/",
      apiKey: "private-weather-key",
      timeoutMs: 2_000,
      forecastDays: 4,
      towns: {
        greenvale: {
          realCityName: "郑州",
          latitude: 34.75,
          longitude: 113.62,
        },
        frostpeak: {
          realCityName: "拉萨",
          latitude: 29.65,
          longitude: 91.1,
        },
      },
    }, "admin-1");

    expect(settings).toMatchObject({
      enabled: true,
      apiHost: "https://abc123.qweatherapi.com",
      apiKeyConfigured: true,
      forecastDays: 4,
    });
    expect(JSON.stringify(await store.load())).not.toContain(
      "private-weather-key",
    );
    expect(weather.providerConfigured).toBe(true);

    const tested = await service.testConnection();
    expect(tested.towns).toEqual([
      expect.objectContaining({
        townId: "greenvale",
        cityName: "郑州",
        forecastDayCount: 1,
      }),
      expect.objectContaining({
        townId: "frostpeak",
        cityName: "拉萨",
        forecastDayCount: 1,
      }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("accepts only dedicated HTTPS QWeather API hosts", () => {
    expect(normalizeQWeatherApiHost("https://abc.qweatherapi.com/"))
      .toBe("https://abc.qweatherapi.com");
    expect(() => normalizeQWeatherApiHost("https://api.qweather.com"))
      .toThrow("QWEATHER_API_HOST_INVALID");
    expect(() => normalizeQWeatherApiHost("http://abc.qweatherapi.com"))
      .toThrow("QWEATHER_API_HOST_INVALID");
    expect(() => normalizeQWeatherApiHost("not-a-url"))
      .toThrow("QWEATHER_API_HOST_INVALID");
  });

  it("fails the admin connection test when daily forecast is unavailable", async () => {
    const service = new TownWeatherSettingsService(
      new MemoryTownWeatherSettingsStore(),
      new TownWeatherService(),
      "test-session-secret",
      {
        apiHost: "https://abc123.qweatherapi.com",
        apiKey: "private-weather-key",
        timeoutMs: 2_000,
        forecastDays: 3,
      },
      qweatherFetcher({ forecastFails: true }) as unknown as typeof fetch,
    );
    await service.initialize();

    await expect(service.testConnection())
      .rejects.toThrow("QWEATHER_FORECAST_UNAVAILABLE");
  });
});
