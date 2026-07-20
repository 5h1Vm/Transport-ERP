/**
 * Pin the process to the business's timezone, before anything constructs a Date.
 *
 * Every "today" and "start of month" in this API is built from server-local
 * time (`new Date().setHours(0,0,0,0)` and friends). Locally that was IST and
 * looked correct; on Vercel the runtime is UTC, which is 5h30m behind — so
 * between midnight and 05:30 IST the server's "today" was still yesterday.
 * The visible symptoms: the P&L report defaulted to a range ending on the
 * previous day and hid trips delivered "today", and the dashboard's
 * "Payments today" tile missed payments recorded after midnight.
 *
 * Setting TZ here fixes every date boundary in one place rather than making
 * each query do its own offset arithmetic. It must run before the first Date
 * is created, so both entrypoints require this module on their first line.
 *
 * APP_TZ overrides it for anyone operating in another timezone.
 */
process.env.TZ = process.env.APP_TZ || 'Asia/Kolkata';

module.exports = { timezone: process.env.TZ };
