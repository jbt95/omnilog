import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Drain } from '../src/index.js';
import { CreateEvent } from './drain-test-helpers.js';

describe('Drain.DeadLetterFile', function DrainDeadLetterFileSuite() {
  it('replays events from dead-letter file source', async function ReplaysEventsFromDeadLetterFileSource() {
    const directory = await mkdtemp(join(tmpdir(), 'typedlog-drains-'));
    const deadLetterPath = join(directory, 'dead-letter.ndjson');

    try {
      const deadLetterSink = Drain.DeadLetterFile({ path: deadLetterPath });
      const source = Drain.FileSource({ path: deadLetterPath });
      const replayedNames: string[] = [];

      const failureEvent = CreateEvent('drain.replay');

      await deadLetterSink({
        reason: 'delivery-failed',
        attempts: 3,
        failedAt: new Date().toISOString(),
        events: [failureEvent],
        error: 'network',
      });

      const result = await source.ReplayTo((event) => {
        replayedNames.push(event.name);
      });

      expect(result).toEqual({ replayed: 1, failed: 0 });
      expect(replayedNames).toEqual(['drain.replay']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
