/** Start of the current calendar day in India Standard Time, as a UTC instant. */
export function istDayStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  return new Date(`${ist.toISOString().slice(0, 10)}T00:00:00+05:30`);
}
