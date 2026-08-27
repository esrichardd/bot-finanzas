import type { IncomingMessage } from "node:http";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import type { Span } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_URL_FULL,
  ATTR_URL_QUERY,
} from "@opentelemetry/semantic-conventions";
import type { Env } from "../../config/env.js";

interface CommonTelemetryConfig {
  environment: Env["NODE_ENV"];
  sampleRatio: number;
  serviceName: string;
  serviceVersion: string;
}

export type TelemetryConfig =
  | (CommonTelemetryConfig & { enabled: false })
  | (CommonTelemetryConfig & { enabled: true; tracesEndpoint: string });

export interface TelemetryController {
  enabled: boolean;
  startupError?: unknown;
  shutdown: () => Promise<void>;
}

export function buildTelemetryConfig(env: Env): TelemetryConfig {
  const common = {
    environment: env.NODE_ENV,
    sampleRatio: env.OTEL_TRACE_SAMPLE_RATIO ?? 1,
    serviceName: env.OTEL_SERVICE_NAME ?? "finanzas-backend",
    serviceVersion: env.OTEL_SERVICE_VERSION ?? "unknown",
  } satisfies CommonTelemetryConfig;

  if (env.OTEL_TRACING_ENABLED !== "true") {
    return { enabled: false, ...common };
  }

  if (env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === undefined) {
    throw new Error(
      "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is required when tracing is enabled",
    );
  }

  return {
    enabled: true,
    tracesEndpoint: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    ...common,
  };
}

export function isIgnoredTelemetryPath(url: string | undefined): boolean {
  return url === "/health" || url?.startsWith("/health?") === true;
}

export function removeQueryFromSpan(
  span: Span,
  request: IncomingMessage,
): void {
  if (request.url === undefined || !request.url.includes("?")) {
    return;
  }

  const host = request.headers.host ?? "localhost";
  const sanitizedUrl = new URL(request.url, `http://${host}`);
  sanitizedUrl.search = "";

  span.setAttribute(ATTR_URL_FULL, sanitizedUrl.toString());
  span.setAttribute(ATTR_URL_QUERY, "REDACTED");
}

export function startTelemetry(config: TelemetryConfig): TelemetryController {
  if (!config.enabled) {
    return {
      enabled: false,
      shutdown: async () => undefined,
    };
  }

  const sdk = new NodeSDK({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.serviceVersion,
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
      }),
    ),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(config.sampleRatio),
    }),
    traceExporter: new OTLPTraceExporter({
      url: config.tracesEndpoint,
    }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) =>
          isIgnoredTelemetryPath(request.url),
        requestHook: (span, request) => {
          if ("headers" in request) {
            removeQueryFromSpan(span, request);
          }
        },
      }),
      new FastifyOtelInstrumentation({
        registerOnInitialization: true,
        ignorePaths: (route) => isIgnoredTelemetryPath(route.url),
        instrumentHooks: false,
      }),
      new PinoInstrumentation({
        disableLogCorrelation: false,
        disableLogSending: true,
      }),
    ],
  });

  try {
    sdk.start();
  } catch (startupError) {
    return {
      enabled: false,
      startupError,
      shutdown: async () => undefined,
    };
  }

  let shutdownPromise: Promise<void> | undefined;

  return {
    enabled: true,
    shutdown: () => {
      shutdownPromise ??= sdk.shutdown();
      return shutdownPromise;
    },
  };
}
