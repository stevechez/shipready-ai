import { describe, expect, it } from 'vitest';
import { CONFIDENCES, FINDING_SCHEMA_VERSION, SEVERITIES, SeveritySchema } from './index';

describe('@shipready/schema', () => {
  it('exposes a pinned finding-schema version', () => {
    expect(FINDING_SCHEMA_VERSION).toBe('0.0.0');
  });

  it('orders canonical severities highest-impact first', () => {
    expect(SEVERITIES[0]).toBe('critical');
    expect(SEVERITIES.at(-1)).toBe('info');
    expect(CONFIDENCES).toContain('tentative');
  });

  it('validates severities and rejects unknown values', () => {
    expect(SeveritySchema.parse('critical')).toBe('critical');
    expect(() => SeveritySchema.parse('catastrophic')).toThrow();
  });
});
