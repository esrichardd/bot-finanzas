import { describe, expect, it, vi } from "vitest";
import type { Span } from "@opentelemetry/api";
import type { IncomingMessage } from "node:http";
import type { Env } from "../../config/env.js";
import {
  buildTelemetryConfig,
  isIgnoredTelemetryPath,
  removeQueryFromSpan,
} from "./telemetry.js";

const baseEnv: Env = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgres://app:app@localhost:5432/app",
  LOG_LEVEL: "info",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "",
};

describe("telemetry configuration", () => {
  it("is disabled by default", () => {
    expect(buildTelemetryConfig(baseEnv)).toEqual({
      enabled: false,
      environment: "test",
      sampleRatio: 1,
      serviceName: "finanzas-backend",
      serviceVersion: "unknown",
    });
  });

  it("builds a provider-neutral OTLP configuration", () => {
    expect(
      buildTelemetryConfig({
        ...baseEnv,
        OTEL_TRACING_ENABLED: "true",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:
          "http://host.docker.internal:4318/v1/traces",
        OTEL_SERVICE_NAME: "custom-backend",
        OTEL_SERVICE_VERSION: "abc123",
        OTEL_TRACE_SAMPLE_RATIO: 0.25,
      }),
    ).toEqual({
      enabled: true,
      environment: "test",
      sampleRatio: 0.25,
      serviceName: "custom-backend",
      serviceVersion: "abc123",
      tracesEndpoint: "http://host.docker.internal:4318/v1/traces",
    });
  });

  it("rejects tracing without an OTLP endpoint", () => {
    expect(() =>
      buildTelemetryConfig({
        ...baseEnv,
        OTEL_TRACING_ENABLED: "true",
      }),
    ).toThrow(/OTEL_EXPORTER_OTLP_TRACES_ENDPOINT/);
  });
});

describe("telemetry privacy and noise controls", () => {
  it.each(["/health", "/health?probe=1"])(
    "ignores health check path %s",
    (path) => {
      expect(isIgnoredTelemetryPath(path)).toBe(true);
    },
  );

  it("does not ignore business routes", () => {
    expect(isIgnoredTelemetryPath("/api/movements")).toBe(false);
  });

  it("removes query values from HTTP spans", () => {
    const setAttribute = vi.fn();
    const span = { setAttribute } as unknown as Span;
    const request = {
      headers: { host: "finanzas.example.com" },
      url: "/api/movements?accountId=sensitive-value",
    } as IncomingMessage;

    removeQueryFromSpan(span, request);

    expect(setAttribute).toHaveBeenCalledWith(
      "url.full",
      "http://finanzas.example.com/api/movements",
    );
    expect(setAttribute).toHaveBeenCalledWith("url.query", "REDACTED");
  });
});
