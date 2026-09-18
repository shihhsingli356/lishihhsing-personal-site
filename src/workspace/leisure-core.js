// Annual, inflation-adjusted withdrawals. All amounts are in today's purchasing power.
export function runway({
  principal,
  spending,
  period = "month",
  returns,
  inflation,
}) {
  if (
    ![principal, spending, returns, inflation].every(Number.isFinite) ||
    principal < 0 ||
    spending < 0 ||
    principal > 1e12 ||
    spending > 1e12 ||
    returns <= -100 ||
    inflation <= -100 ||
    returns > 100 ||
    inflation > 100
  ) {
    throw new Error("请填写有效金额和收益率");
  }
  const annual = spending * (period === "month" ? 12 : 1);
  const rate = (1 + returns / 100) / (1 + inflation / 100) - 1;
  const perpetual =
    annual === 0 ||
    (principal > 0 && rate > 0 && principal * rate >= annual - annual * 1e-12);
  let balance = principal;
  const points = [balance];
  if (!balance && annual > 0)
    return {
      years: 0,
      perpetual: false,
      beyondHorizon: false,
      rate,
      annual,
      points,
    };
  for (let year = 1; year <= 100; year++) {
    const available = balance * (1 + rate);
    balance = Math.max(0, available - annual);
    points.push(balance);
    if (!perpetual && balance <= annual * 1e-12) {
      return {
        years: year - 1 + Math.min(1, available / annual),
        perpetual,
        beyondHorizon: false,
        rate,
        annual,
        points,
      };
    }
    if (perpetual && year >= 30) break;
  }
  return {
    years: perpetual ? Infinity : 100,
    perpetual,
    beyondHorizon: !perpetual,
    rate,
    annual,
    points,
  };
}

export function runwayLabel(result) {
  if (result.perpetual) return "∞";
  if (result.beyondHorizon) return "100+";
  if (result.years > 0 && result.years < 0.1) return "<0.1";
  return Number(result.years.toFixed(1)).toString();
}

export function runwayBand(result) {
  return result.perpetual
    ? 5
    : result.years <= 1
      ? 0
      : result.years <= 5
        ? 1
        : result.years <= 15
          ? 2
          : result.years <= 25
            ? 3
            : 4;
}

export function randomIndex(
  length,
  fill = (array) => crypto.getRandomValues(array),
) {
  if (!Number.isInteger(length) || length < 1 || length > 0x100000000)
    throw new Error("没有可抽取的选项");
  const word = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / length) * length;
  do {
    fill(word);
  } while (word[0] >= limit);
  return word[0] % length;
}

export function parseChoices(text, limit = 200) {
  const items = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (!items.length) throw new Error("每行填写一个选项");
  if (items.length > limit) throw new Error(`最多 ${limit} 个选项`);
  if (items.some((item) => item.length > 80))
    throw new Error("每个选项最多 80 个字");
  return items;
}

export function drawChoices(items, count, choose = randomIndex) {
  if (!Number.isInteger(count) || count < 1 || count > items.length)
    throw new Error("抽取数量超过剩余选项");
  const pool = [...items];
  const picked = [];
  for (let i = 0; i < count; i++)
    picked.push(pool.splice(choose(pool.length), 1)[0]);
  return { picked, remaining: pool };
}

// Flat side = yang; rounded side = yin. Source: Taiwan Ministry of Culture's jiaobei collection.
export function jiaobeiResult(firstFlat, secondFlat) {
  if (firstFlat !== secondFlat)
    return { name: "圣筊", meaning: "允", kind: "yes" };
  return firstFlat
    ? { name: "笑筊", meaning: "未定", kind: "wait" }
    : { name: "阴筊", meaning: "不允", kind: "no" };
}
