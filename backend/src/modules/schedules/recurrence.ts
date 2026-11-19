export const scheduleTimezone = 'Asia/Ho_Chi_Minh';
const dayMs = 86_400_000;
const offsetMs = 7 * 60 * 60_000;

export interface ScheduleRule {
  startDate: string;
  time: string;
  recurrence: 'once' | 'daily' | 'weekly' | 'monthly';
  interval: number;
}

export function validLocalDate(value: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function anchor(rule: ScheduleRule): number {
  return Date.parse(`${rule.startDate}T${rule.time}:00.000+07:00`);
}

function monthlyOccurrence(rule: ScheduleRule, index: number): number {
  const local = new Date(`${rule.startDate}T${rule.time}:00.000Z`);
  const month = local.getUTCMonth() + index * rule.interval;
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return Date.UTC(local.getUTCFullYear(), month, Math.min(local.getUTCDate(), lastDay),
    local.getUTCHours(), local.getUTCMinutes()) - offsetMs;
}

function approximateMonthIndex(rule: ScheduleRule, timestamp: number): number {
  const local = new Date(timestamp + offsetMs);
  const initial = new Date(`${rule.startDate}T00:00:00Z`);
  const months = (local.getUTCFullYear() - initial.getUTCFullYear()) * 12 + local.getUTCMonth() - initial.getUTCMonth();
  return Math.max(0, Math.floor(months / rule.interval));
}

export function nextOccurrence(rule: ScheduleRule, from: Date): Date | null {
  const start = anchor(rule);
  const cutoff = from.getTime();
  if (rule.recurrence === 'once') return start >= cutoff ? new Date(start) : null;
  if (rule.recurrence === 'monthly') {
    let index = approximateMonthIndex(rule, cutoff);
    let next = monthlyOccurrence(rule, index);
    if (next < cutoff) next = monthlyOccurrence(rule, ++index);
    return new Date(next);
  }
  const step = dayMs * rule.interval * (rule.recurrence === 'weekly' ? 7 : 1);
  return new Date(start + Math.max(0, Math.ceil((cutoff - start) / step)) * step);
}

export function latestOccurrence(rule: ScheduleRule, through: Date): Date | null {
  const start = anchor(rule);
  const cutoff = through.getTime();
  if (cutoff < start) return null;
  if (rule.recurrence === 'once') return new Date(start);
  if (rule.recurrence === 'monthly') {
    let index = approximateMonthIndex(rule, cutoff);
    let latest = monthlyOccurrence(rule, index);
    if (latest > cutoff) latest = monthlyOccurrence(rule, --index);
    return latest >= start ? new Date(latest) : null;
  }
  const step = dayMs * rule.interval * (rule.recurrence === 'weekly' ? 7 : 1);
  return new Date(start + Math.floor((cutoff - start) / step) * step);
}

export function initialOccurrence(rule: ScheduleRule, now: Date): Date {
  // A missed one-time schedule produces one reminder. Repeating imports start from the next occurrence.
  return rule.recurrence === 'once' ? new Date(anchor(rule)) : nextOccurrence(rule, now)!;
}
