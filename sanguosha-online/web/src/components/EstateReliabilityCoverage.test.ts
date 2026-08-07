import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(
  new URL(`./${name}`, import.meta.url),
  'utf8',
);

describe('estate request reliability coverage', () => {
  it.each([
    'HomesteadScreen.tsx',
    'FarmScreen.tsx',
    'RanchScreen.tsx',
    'MineScreen.tsx',
  ])('%s guards mutations and stale responses', (screen) => {
    const content = source(screen);
    expect(content).toContain('actionInFlight.current');
    expect(content).toContain('loadRequestSequence.current');
    expect(content).toContain('isLatestRequest');
    expect(content).toContain('isTownRevisionVectorAtLeast');
    expect(content).toContain('townChanged');
    expect(content).toContain('useSerialActionQueue');
    expect(content).toContain('awaitWithAbort');
    expect(content).toContain('cancelPendingActions');
    expect(content).not.toContain('attempt < 2');

    if (screen === 'HomesteadScreen.tsx') {
      expect(content).toContain('requiresAuthoritativeHomesteadRefresh');
      expect(content).not.toContain('previousCount > 0 && queuedActionCount === 0');
    } else {
      expect(content).toContain('previousCount > 0 && queuedActionCount === 0');
    }
  });
});
