import { appendFile, readFile } from 'node:fs/promises';
import type {
  DrainFailure,
  DrainReplayOptions,
  DrainReplayResult,
  Envelope,
  Sink,
} from '../types.js';

export type FileSourceOptions = {
  path: string;
};

/**
 * Write drain failures to newline-delimited JSON.
 */
export function CreateDeadLetterFileSink<Context = unknown, Payload = unknown>(
  options: FileSourceOptions,
): Sink<DrainFailure<Context, Payload>> {
  return async (failure) => {
    const line = `${JSON.stringify(failure)}\n`;
    await appendFile(options.path, line, 'utf8');
  };
}

/**
 * Replay source for newline-delimited drain failure files.
 */
export class FileSource<Context = unknown, Payload = unknown> {
  private readonly path: string;

  constructor(options: FileSourceOptions) {
    this.path = options.path;
  }

  async ReadFailures(): Promise<DrainFailure<Context, Payload>[]> {
    let content = '';
    try {
      content = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return lines.map((line) => JSON.parse(line) as DrainFailure<Context, Payload>);
  }

  async ReplayTo(
    sink: Sink<Envelope<Context, Payload>>,
    options: DrainReplayOptions = {},
  ): Promise<DrainReplayResult> {
    const failures = await this.ReadFailures();
    const maxPerSecond = options.maxPerSecond ? Math.max(1, options.maxPerSecond) : undefined;
    const perEventDelayMs = maxPerSecond ? 1000 / maxPerSecond : 0;

    let replayed = 0;
    let failed = 0;

    for (const failure of failures) {
      try {
        for (const event of failure.events) {
          await Promise.resolve(sink(event));
          replayed += 1;
          if (perEventDelayMs > 0) {
            await Sleep(perEventDelayMs);
          }
        }
      } catch (_error) {
        failed += 1;
      }
    }

    return { replayed, failed };
  }
}

/**
 * Create a replay file source.
 */
export function CreateFileSource<Context = unknown, Payload = unknown>(
  options: FileSourceOptions,
): FileSource<Context, Payload> {
  return new FileSource<Context, Payload>(options);
}

function Sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
