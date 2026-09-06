import { describe, expect, it } from 'bun:test';
import { getStatus, validateAge, AgeGateError, UnderageError } from './service';

describe('age-gate getStatus', () => {
  it('returns disabled when mode none', () => {
    const s = getStatus({ enabled: true, mode: 'none', minimumAge: 18 }, null);
    expect(s.isEnabled).toBe(false);
    expect(s.hasPassed).toBe(true);
  });

  it('returns disabled when enabled false', () => {
    const s = getStatus({ enabled: false, mode: 'self-declaration', minimumAge: 18 }, { birth_date: '1990-01-01', age_gate_accepted_at: '2024-01-01' });
    expect(s.isEnabled).toBe(false);
  });

  it('passes with birth date + accepted', () => {
    const s = getStatus({ enabled: true, mode: 'self-declaration', minimumAge: 18 }, { birth_date: '1990-01-01', age_gate_accepted_at: '2024-01-01' });
    expect(s.isEnabled).toBe(true);
    expect(s.hasPassed).toBe(true);
  });

  it('fails when birth missing', () => {
    const s = getStatus({ enabled: true, mode: 'self-declaration', minimumAge: 18 }, { birth_date: null, age_gate_accepted_at: '2024-01-01' });
    expect(s.hasPassed).toBe(false);
  });
});

describe('age-gate validateAge', () => {
  it('accepts valid adult birth date', () => {
    validateAge('1990-01-01', 18);
  });

  it('rejects underage', () => {
    expect(() => validateAge('2010-01-01', 18)).toThrow(UnderageError);
  });

  it('throws AgeGateError on bad format', () => {
    expect(() => validateAge('bad', 18)).toThrow(AgeGateError);
  });
});
