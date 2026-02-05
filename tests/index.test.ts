import { describe, expect, it } from 'vitest';
import {
  TypedLogger,
  DefineEvent,
  CreateRegistry,
  CreateMemorySink,
  CreateRedactionPolicy,
  CreateError,
  ParseError,
} from '../src/index.js';

describe('Index Exports', function IndexExportsSuite() {
  it('exposes core API', function ExposesCoreApi() {
    expect(typeof TypedLogger.For).toBe('function');
    expect(typeof DefineEvent).toBe('function');
    expect(typeof CreateRegistry).toBe('function');
    expect(typeof CreateMemorySink).toBe('function');
    expect(typeof CreateRedactionPolicy).toBe('function');
    expect(typeof CreateError).toBe('function');
    expect(typeof ParseError).toBe('function');
  });
});
