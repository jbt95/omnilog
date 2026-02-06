# t-log

Schema-first, type-safe structured logging and observability library.

## Quick Reference

- Package Manager: `pnpm`
- Node: `>=20`
- Build: `pnpm run build`
- Test: `pnpm test`
- Typecheck: `pnpm run typecheck`

## Conventions

- Functions, classes, methods, and interfaces use **PascalCase**.
- Variables use **camelCase**.
- File names use **kebab-case**.

## API Direction

- Use `TypedLogger.For(...)` as the only entry point for creating loggers.
- Do not expose `CreateLogger` from public exports.
- Request-scoped logging must use `AsyncLocalStorage` and provide `Get()`.
