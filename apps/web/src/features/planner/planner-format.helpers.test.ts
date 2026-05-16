import { describe, expect, it } from 'vitest';
import { formatPlannerInteger, formatPlannerNumber } from './planner-format.helpers';

describe('planner format helpers', () => {
  it('formats planner integers with thousands separators', () => {
    expect(formatPlannerInteger(1234)).toBe('1,234');
  });

  it('formats planner decimal values consistently for selector labels', () => {
    expect(formatPlannerNumber(1.2345)).toBe('1.235');
    expect(formatPlannerNumber(12.345)).toBe('12.35');
    expect(formatPlannerNumber(-0)).toBe('0');
  });
});
