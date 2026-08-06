import { describe, expect, it } from 'vitest';
import { banner, version } from './index';

describe('@shipready/cli', () => {
  it('reports a version', () => {
    expect(version()).toBe('0.0.0');
  });

  it('renders a banner naming the core', () => {
    expect(banner()).toBe('shipready 0.0.0 — core: @shipready/core');
  });
});
