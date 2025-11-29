/**
 * Get month ranges for batching API calls
 * Splits a date range into individual months for processing
 * @param start - Start date in YYYY-MM-DD format
 * @param end - End date in YYYY-MM-DD format
 * @returns Array of {start, end} date ranges for each month
 */
export function getMonthRanges(start: string, end: string): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  const startDate = new Date(start);
  const endDate = new Date(end);

  let current = new Date(startDate);
  while (current <= endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    ranges.push({
      start: firstDay.toISOString().slice(0, 10),
      end: lastDay.toISOString().slice(0, 10),
    });

    current = new Date(year, month + 1, 1);
  }

  return ranges;
}
