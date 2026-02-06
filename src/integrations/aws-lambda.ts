/**
 * AWS Lambda integration
 * @module integrations/aws-lambda
 */

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
  APIGatewayProxyResultV2,
  Context as LambdaContext,
} from 'aws-lambda';
import type { z } from 'zod';
import type { EventDefAny } from '../types.js';
import type { LoggerFactory } from '../typed-logger.js';
import type { LoggerInstance } from '../logger.js';
import type { IntegrationOptions } from './integration-options.js';
import { GetIntegrationDefaults } from './integration-options.js';

export type LambdaEvent = APIGatewayProxyEvent | APIGatewayProxyEventV2;
export type LambdaResult = APIGatewayProxyResult | APIGatewayProxyResultV2;

type LambdaInput = {
  event: LambdaEvent;
  context: LambdaContext;
};

function ResolveHeader(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  return headers[name.toLowerCase()] ?? headers[name] ?? undefined;
}

function BuildContext<Context>(
  event: LambdaEvent,
  context: LambdaContext,
  options: IntegrationOptions<Context, LambdaInput>,
): Partial<Context> {
  const defaults = GetIntegrationDefaults(options);
  const eventV2 = event as APIGatewayProxyEventV2;
  const eventV1 = event as APIGatewayProxyEvent;
  const method = eventV2.requestContext?.http?.method ?? eventV1.httpMethod;
  const path = eventV2.requestContext?.http?.path ?? eventV2.rawPath ?? eventV1.path;
  const requestId =
    eventV2.requestContext?.requestId ??
    eventV1.requestContext?.requestId ??
    context.awsRequestId ??
    ResolveHeader(event.headers ?? {}, defaults.RequestIdHeader);
  const userAgent =
    eventV2.requestContext?.http?.userAgent ??
    eventV1.requestContext?.identity?.userAgent ??
    ResolveHeader(event.headers ?? {}, 'user-agent');
  const ip =
    eventV2.requestContext?.http?.sourceIp ??
    eventV1.requestContext?.identity?.sourceIp ??
    ResolveHeader(event.headers ?? {}, 'x-forwarded-for');
  const baseContext = {
    method,
    path,
    requestId,
    userAgent,
    ip,
  };
  const extraContext = options.GetContext?.({ event, context }) ?? {};
  return { ...baseContext, ...extraContext } as unknown as Partial<Context>;
}

export function CreateLambdaHandler<
  ContextSchema extends z.ZodObject<z.ZodRawShape>,
  const Events extends readonly EventDefAny[],
  Result = LambdaResult,
>(
  loggerFactory: LoggerFactory<ContextSchema, Events>,
  handler: (
    event: LambdaEvent,
    context: LambdaContext,
    logger: LoggerInstance<ContextSchema, Events>,
  ) => Result | Promise<Result>,
  options: IntegrationOptions<z.output<ContextSchema>, LambdaInput> = {},
): (event: LambdaEvent, context: LambdaContext) => Result | Promise<Result> {
  return (event, context) => {
    const mergedContext = BuildContext(event, context, options) as z.output<ContextSchema>;
    return loggerFactory.Scoped(mergedContext, (logger) => handler(event, context, logger));
  };
}
