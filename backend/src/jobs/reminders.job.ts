// Automatic reminders: N days before the due date (settings.autoReminderDays, e.g. "7,2"),
// email every invited customer who hasn't submitted yet. Runs hourly; sends at most once per day per customer.
import { Customer } from '../models/Customer.js';
import { Settings } from '../models/Settings.js';
import { sendCustomerEmail, smtpConfigured } from '../services/mailer.service.js';
import { audit } from '../utils/audit.js';
import { logger } from '../utils/logger.js';

const dubaiDay = (d: Date | string): string =>
  new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Dubai' })).toDateString();

export async function runReminders(): Promise<{ skipped?: boolean; sent?: number; daysLeft?: number }> {
  const s = await Settings.get();
  if (!s.dueDate || !s.autoReminderDays?.trim() || !smtpConfigured()) return { skipped: true };
  const days = s.autoReminderDays
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => n >= 0);
  const todayStr = dubaiDay(new Date());
  const daysLeft = Math.round((new Date(dubaiDay(s.dueDate)).getTime() - new Date(todayStr).getTime()) / 864e5);
  if (!days.includes(daysLeft)) return { skipped: true, daysLeft };

  const pending = await Customer.find({ status: { $in: ['invited', 'opened'] }, token: { $ne: null } });
  let sent = 0;
  for (const c of pending) {
    if (c.lastReminderAt && dubaiDay(c.lastReminderAt) === todayStr) continue;
    if (c.invitedAt && dubaiDay(c.invitedAt) === todayStr) continue;
    const r = await sendCustomerEmail('reminder', c, s);
    if (r.ok) {
      c.reminderCount = (c.reminderCount || 0) + 1;
      c.lastReminderAt = new Date();
      sent++;
    }
    await c.save();
  }
  if (sent) await audit(null, 'email.auto_reminder', { actor: 'system', details: { sent, daysLeft } });
  return { sent, daysLeft };
}

export function startReminderJob(): NodeJS.Timeout {
  const tick = () =>
    runReminders()
      .then((r) => r.sent && logger.info(r, '[reminders] sent automatic reminders'))
      .catch((e: unknown) => logger.error({ err: e }, '[reminders] run failed'));
  setTimeout(tick, 30 * 1000);
  return setInterval(tick, 60 * 60 * 1000);
}
