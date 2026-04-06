export type SettlementReminderSettings = {
  is_enabled: boolean;
  next_notification_on: string;
  interval_months: number;
  notification_day: number;
  last_notified_on: string | null;
};

export function getTokyoDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '0');

  return { year, month, day };
}

export function formatDateParts(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getTodayInTokyo(now = new Date()) {
  return formatDateParts(getTokyoDateParts(now));
}

export function parseDateString(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonthsWithDay(dateString: string, monthsToAdd: number, preferredDay: number) {
  const { year, month } = parseDateString(dateString);
  const zeroIndexedMonth = month - 1 + monthsToAdd;
  const nextYear = year + Math.floor(zeroIndexedMonth / 12);
  const nextMonth = ((zeroIndexedMonth % 12) + 12) % 12 + 1;
  const nextDay = Math.min(preferredDay, daysInMonth(nextYear, nextMonth));

  return formatDateParts({ year: nextYear, month: nextMonth, day: nextDay });
}

export function buildDefaultSettlementReminderSettings(): SettlementReminderSettings {
  const today = getTodayInTokyo();
  return {
    is_enabled: true,
    next_notification_on: today,
    interval_months: 1,
    notification_day: parseDateString(today).day,
    last_notified_on: null,
  };
}
