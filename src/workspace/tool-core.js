const DAY = 86400000;
export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请选择有效日期");
  const d = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== value)
    throw new Error("请选择有效日期");
  return d;
}
export function dateDifference(a, b, inclusive = false) {
  let start = parseDate(a),
    end = parseDate(b);
  if (start > end) [start, end] = [end, start];
  const days = Math.round((end - start) / DAY) + Number(inclusive);
  let weekdays = Math.floor(days / 7) * 5;
  for (let i = 0; i < days % 7; i++) {
    const day = (start.getUTCDay() + i) % 7;
    if (day !== 0 && day !== 6) weekdays++;
  }
  return { days, weekdays };
}
export function shiftDate(value, amount, unit) {
  const d = parseDate(value);
  if (!Number.isInteger(amount) || Math.abs(amount) > 100000)
    throw new Error("请输入有效的整数，最多 100000");
  if (unit === "month" || unit === "year") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + amount * (unit === "year" ? 12 : 1));
    const last = new Date(+d);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    d.setUTCDate(Math.min(day, last.getUTCDate()));
  } else if (unit === "weekday") {
    for (let left = Math.abs(amount); left > 0;) {
      d.setUTCDate(d.getUTCDate() + Math.sign(amount));
      if (![0, 6].includes(d.getUTCDay())) left--;
    }
  } else d.setUTCDate(d.getUTCDate() + amount * (unit === "week" ? 7 : 1));
  if (d.getUTCFullYear() < 1 || d.getUTCFullYear() > 9999)
    throw new Error("结果日期超出支持范围");
  return d.toISOString().slice(0, 10);
}
export function pageRange(value, count) {
  const pages = [];
  for (const part of value.replaceAll("，", ",").split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error("页码格式如 1-3,5,8-10");
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a < 1 || b > count || a > b)
      throw new Error(`页码须在 1–${count} 之间`);
    for (let n = a; n <= b; n++) if (!pages.includes(n - 1)) pages.push(n - 1);
  }
  return pages;
}
