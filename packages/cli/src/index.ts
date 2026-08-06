import type { CoreInfo } from '@shipready/core';

/** The CLI version. Real command routing (`scan`, `login`, `push`) lands in later sprints. */
export function version(): string {
  return '0.0.0';
}

/** A one-line banner. Typed against the core's public shape to anchor the cli→core edge. */
export function banner(coreName: CoreInfo['name'] = '@shipready/core'): string {
  return `shipready ${version()} — core: ${coreName}`;
}

// Executable entry: print the banner when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${banner()}\n`);
}
