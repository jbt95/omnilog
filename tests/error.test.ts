import { describe, expect, it } from 'vitest';
import { Error as LogError } from '../src/index.js';

describe('Error', function ErrorSuite() {
  it('creates structured errors with context', function CreatesStructuredErrorsWithContext() {
    const error = LogError.Create({
      message: 'Payment processing failed',
      code: 'PAYMENT_ERROR',
      domain: 'integration',
      reason: 'The payment gateway returned a timeout',
      resolution: 'Retry the payment or use a different method',
      documentation: 'https://docs.example.com/errors/payment',
    });

    expect(error).toBeInstanceOf(LogError.Omni);
    expect(error.message).toBe('Payment processing failed');
    expect(error.code).toBe('PAYMENT_ERROR');
    expect(error.domain).toBe('integration');
    expect(error.reason).toBe('The payment gateway returned a timeout');
    expect(error.resolution).toBe('Retry the payment or use a different method');
    expect(error.documentation).toBe('https://docs.example.com/errors/payment');
  });

  it('adds breadcrumbs to errors', function AddsBreadcrumbsToErrors() {
    const error = LogError.Create({
      message: 'Database connection failed',
      code: 'DB_ERROR',
    });

    error
      .AddBreadcrumb('Connecting to primary database', 'db')
      .AddBreadcrumb('Connection timeout after 30s', 'db')
      .AddBreadcrumb('Falling back to replica', 'db');

    expect(error.breadcrumbs).toHaveLength(3);
    expect(error.breadcrumbs[0]?.message).toBe('Connecting to primary database');
    expect(error.breadcrumbs[0]?.category).toBe('db');
  });

  it('parses regular errors into structured errors', function ParsesRegularErrorsIntoStructuredErrors() {
    const regularError = new Error('Something went wrong');
    const parsedError = LogError.Parse(regularError);

    expect(parsedError).toBeInstanceOf(LogError.Omni);
    expect(parsedError.message).toBe('Something went wrong');
    expect(parsedError.code).toBe('UNKNOWN_ERROR');
    expect(parsedError.domain).toBe('unknown');
  });

  it('preserves explicit code/domain from native errors', function PreservesCodeAndDomainFromNativeErrors() {
    const nativeWithMetadata = Object.assign(new Error('Timeout from provider'), {
      code: 'DRAIN_TIMEOUT',
      domain: 'drain',
    });
    const parsedError = LogError.Parse(nativeWithMetadata);

    expect(parsedError.code).toBe('DRAIN_TIMEOUT');
    expect(parsedError.domain).toBe('drain');
    expect(parsedError.message).toBe('Timeout from provider');
  });

  it('parses object permutations into structured errors', function ParsesObjectPermutationsIntoStructuredErrors() {
    const parsedError = LogError.Parse({
      message: 'Object error',
      code: 'CUSTOM_OBJECT_ERROR',
      domain: 'integration',
      reason: 'Object-based throw',
      resolution: 'Normalize throws to Error or OmniError',
    });

    expect(parsedError).toBeInstanceOf(LogError.Omni);
    expect(parsedError.message).toBe('Object error');
    expect(parsedError.code).toBe('CUSTOM_OBJECT_ERROR');
    expect(parsedError.domain).toBe('integration');
    expect(parsedError.reason).toBe('Object-based throw');
    expect(parsedError.resolution).toBe('Normalize throws to Error or OmniError');
  });

  it('parses primitive permutations into unknown structured errors', function ParsesPrimitivePermutationsIntoUnknownStructuredErrors() {
    const values: unknown[] = ['boom', 42, true, null, undefined];
    for (const value of values) {
      const parsedError = LogError.Parse(value);
      expect(parsedError).toBeInstanceOf(LogError.Omni);
      expect(parsedError.message).toBe(String(value));
      expect(parsedError.code).toBe('UNKNOWN_ERROR');
      expect(parsedError.domain).toBe('unknown');
    }
  });

  it('returns the same OmniError instance when already structured', function ReturnsSameOmniErrorInstanceWhenAlreadyStructured() {
    const originalError = LogError.Create({
      message: 'Already structured',
      code: 'ALREADY_STRUCTURED',
      domain: 'logger',
    });
    const parsedError = LogError.Parse(originalError);
    expect(parsedError).toBe(originalError);
  });

  it('creates domain errors with stable code and domain', function CreatesDomainErrorsWithStableCodeAndDomain() {
    const error = LogError.Domain('logger', 'LOGGER_UNKNOWN_EVENT', 'Unknown event: foo');
    expect(error).toBeInstanceOf(LogError.Omni);
    expect(error.code).toBe('LOGGER_UNKNOWN_EVENT');
    expect(error.domain).toBe('logger');
  });

  it('converts error to JSON', function ConvertsErrorToJson() {
    const error = LogError.Create({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      reason: 'Required field missing',
    });

    error.WithContext('field', 'email').WithContext('value', null);

    const json = error.ToJSON();
    expect(json.message).toBe('Validation failed');
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.context).toEqual({ field: 'email', value: null });
  });
});
