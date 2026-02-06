/**
 * Shared integration options
 * @module integrations
 */

export type IntegrationOptions<Context, Input> = {
  /** Key used to attach the logger */
  LoggerKey?: string;
  /** Header name for request ID */
  RequestIdHeader?: string;
  /** Custom context builder */
  GetContext?: (input: Input) => Partial<Context>;
};

export type IntegrationDefaults = {
  LoggerKey: string;
  RequestIdHeader: string;
};

export function GetIntegrationDefaults<Context, Input>(
  options?: IntegrationOptions<Context, Input>,
): IntegrationDefaults {
  return {
    LoggerKey: options?.LoggerKey ?? 'logger',
    RequestIdHeader: options?.RequestIdHeader ?? 'x-request-id',
  };
}
