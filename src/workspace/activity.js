import { addDays, dayString, validDay } from "./core.js";

export function recordedHours(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  return (Math.floor(minutes / 6) + (minutes % 6 >= 4 ? 1 : 0)) / 10;
}
export function segmentDuration(segments) {
  return segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
}
export function validateFocusEdit(segments, others = [], now = Date.now()) {
  const clean = cleanSegments(segments);
  if (!clean.length) throw Error("至少保留一个时间段");
  if (clean.some((s) => s.end > now)) throw Error("不能记录未来时间");
  if (clean.some((s) => others.some((o) => s.start < o.end && s.end > o.start)))
    throw Error("此时间段与其他专注记录重叠");
  return clean;
}
export function cleanSegments(value) {
  if (!Array.isArray(value) || value.length > 10000)
    throw Error("专注片段无效");
  let lastEnd = 0;
  return value.map((s) => {
    if (
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start <= 0 ||
      s.end <= s.start ||
      s.start < lastEnd ||
      s.end > 8640000000000000
    )
      throw Error("专注片段时间无效或重叠");
    lastEnd = s.end;
    return { start: s.start, end: s.end };
  });
}
export function periodRange(kind, day, from = day, to = day) {
  if (!validDay(day)) throw Error("请选择有效日期");
  const d = new Date(day + "T12:00:00"),
    y = d.getFullYear(),
    m = d.getMonth();
  const monthRange = (first, count) => ({
    start: dayString(new Date(y, first, 1, 12)),
    end: dayString(new Date(y, first + count, 0, 12)),
  });
  if (kind === "custom") {
    if (!validDay(from) || !validDay(to) || to < from)
      throw Error("请选择有效起止日期");
    return { start: from, end: to };
  }
  if (kind === "week") {
    const start = addDays(day, -((d.getDay() + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  if (kind === "month") return monthRange(m, 1);
  if (kind === "quarter") return monthRange(Math.floor(m / 3) * 3, 3);
  if (kind === "half") return monthRange(Math.floor(m / 6) * 6, 6);
  if (kind === "year") return monthRange(0, 12);
  return { start: day, end: day };
}
export function focusStats(records, start, end) {
  const min = new Date(start + "T00:00:00").getTime(),
    max = new Date(addDays(end, 1) + "T00:00:00").getTime();
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const days = {},
    items = [];
  let totalMs = 0;
  for (const r of records.filter((r) => !r.deletedAt)) {
    let duration = 0;
    for (const s of r.segments) {
      let cursor = Math.max(min, s.start),
        stop = Math.min(max, s.end);
      while (cursor < stop) {
        const d = new Date(cursor),
          next = new Date(cursor);
        next.setHours(d.getHours() + 1, 0, 0, 0);
        const until = Math.min(stop, next.getTime()),
          ms = until - cursor;
        if (ms <= 0) break;
        grid[(d.getDay() + 6) % 7][d.getHours()] += ms / 60000;
        days[dayString(d)] = (days[dayString(d)] || 0) + ms;
        duration += ms;
        cursor = until;
      }
    }
    if (duration) items.push({ ...r, duration });
    totalMs += duration;
  }
  return { grid, days, items, totalMs };
}
export function moneyCents(value) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(String(value)))
    throw Error("金额须为正数，最多两位小数");
  const [whole, fraction = ""] = String(value).split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw Error("金额须大于 0");
  return cents;
}
