export function formatPlannerInteger(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatPlannerNumber(value: number): string {
  const decimalPlaces = Math.abs(value) < 10 && !Number.isInteger(value) ? 3 : 2;
  return value
    .toLocaleString('en-US', {
      maximumFractionDigits: decimalPlaces,
      minimumFractionDigits: 0,
    })
    .replace(/^-0$/, '0');
}
