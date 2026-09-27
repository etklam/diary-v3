export function accountLocalTime(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function accountTimeChoices(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return [];
  const naive = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(naive)) return [];
  const offsets = new Set<number>();
  for (let hour = -36; hour <= 36; hour += 3) {
    const sample = naive + hour * 3600_000;
    offsets.add(Date.parse(`${accountLocalTime(new Date(sample).toISOString(), timezone)}:00Z`) - sample);
  }
  return [...offsets].map(offset => new Date(naive - offset).toISOString()).filter(instant => accountLocalTime(instant, timezone) === value).sort();
}
export function accountReviewPreset(now: Date, timezone: string, days: number) {
  const date = new Date(`${accountLocalTime(now.toISOString(), timezone).slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.toISOString().slice(0, 10)}T09:00`;
}
