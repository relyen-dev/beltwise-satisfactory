import type { RateDecimalPlaces } from '@beltwise/planner-core';

export function formatDisplayDecimalValue(
  value: number | undefined,
  decimalPlaces: RateDecimalPlaces,
): string {
  const safeValue = value ?? 0;
  return Number.isInteger(safeValue)
    ? safeValue.toString()
    : safeValue.toFixed(decimalPlaces).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatMachineCount(
  machineCount: number | undefined,
  decimalPlaces: RateDecimalPlaces,
): string {
  return formatDisplayDecimalValue(machineCount, decimalPlaces);
}

export function formatRate(
  amountPerMinute: number | undefined,
  decimalPlaces: RateDecimalPlaces,
): string {
  return formatDisplayDecimalValue(amountPerMinute, decimalPlaces);
}
