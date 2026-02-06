import { describe, expect, it } from 'vitest';
import { Error as LogError } from '../src/index.js';

describe('Error', function ErrorSuite() {
  it('creates typed errors with context', function CreatesTypedErrorsWithContext() {
    const error = LogError.Create({
      message: 'Payment processing failed',
      code: 'PAYMENT_ERROR',
      domain: 'integration',
      reason: 'The payment gateway returned a timeout',
      resolution: 'Retry the payment or use a different method',
      documentation: 'https://docs.example.com/errors/payment',
    });

    expect(error).toBeInstanceOf(LogError.Typed);
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

  it('parses regular errors into typed errors', function ParsesRegularErrorsIntoTypedErrors() {
    const regularError = new Error('Something went wrong');
    const typedError = LogError.Parse(regularError);

    expect(typedError).toBeInstanceOf(LogError.Typed);
    expect(typedError.message).toBe('Something went wrong');
    expect(typedError.code).toBe('UNKNOWN_ERROR');
    expect(typedError.domain).toBe('unknown');
  });

  it('parses non-error values into typed errors', function ParsesNonErrorValuesIntoTypedErrors() {
    const typedError = LogError.Parse('boom');

    expect(typedError).toBeInstanceOf(LogError.Typed);
    expect(typedError.message).toBe('boom');
    expect(typedError.code).toBe('UNKNOWN_ERROR');
    expect(typedError.domain).toBe('unknown');
  });

  it('creates domain errors with stable code and domain', function CreatesDomainErrorsWithStableCodeAndDomain() {
    const error = LogError.Domain('logger', 'LOGGER_UNKNOWN_EVENT', 'Unknown event: foo');
    expect(error).toBeInstanceOf(LogError.Typed);
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
