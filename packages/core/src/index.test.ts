import { describe, expect, it } from 'vitest';
import { CORE_INFO, highestSeverity } from './index';

describe('@shipready/core', () => {
  it('is provider-blind by declaration', () => {
    expect(CORE_INFO.providerBlind).toBe(true);
    expect(CORE_INFO.name).toBe('@shipready/core');
  });

  it('treats critical as the highest canonical severity', () => {
    expect(highestSeverity()).toBe('critical');
  });
});
