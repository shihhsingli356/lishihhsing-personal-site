import { runway, runwayBand, runwayLabel } from "./leisure-core.js";

const principals = [20, 50, 100, 150, 200, 300, 500, 1000].map(
  (n) => n * 10000,
);
const expenses = [2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => n * 10000);
const number = (value) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
const colors = [
  "#fde4e1",
  "#ffecd8",
  "#fff4d4",
  "#e8efcd",
  "#d4ece2",
  "#abd9c8",
];
let values = {
  principal: 1000000,
  spending: 5000,
  period: "month",
  returns: 2.2,
  inflation: 1,
};

export function renderRetirement(body) {
  body.innerHTML = `<div class="retirement-tool">
    <div class="retirement-main">
      <form class="leisure-panel retirement-controls">
        <label>可用本金（元）<input name="principal" type="number" min="0" max="1000000000000" step="any" value="${values.principal}" required inputmode="decimal"></label>
        <div class="spending-heading"><span>生活开销（元）</span><div class="mini-segment" aria-label="消费周期"><button type="button" data-period="month">每月</button><button type="button" data-period="year">每年</button></div></div>
        <input name="spending" aria-label="生活开销（元）" type="number" min="0" max="1000000000000" step="any" value="${values.spending}" required inputmode="decimal">
        <div class="retirement-rates"><label>年化收益（%）<input name="returns" type="number" min="-99" max="100" step="any" value="${values.returns}" required inputmode="decimal"></label><label>通胀率（%）<input name="inflation" type="number" min="-99" max="100" step="any" value="${values.inflation}" required inputmode="decimal"></label></div>
      </form>
      <section class="leisure-panel retirement-result" aria-live="polite"></section>
    </div>
    <section class="leisure-panel retirement-matrix"><div class="matrix-heading"><h3>本金 × 年消费</h3><button type="button" data-save-runway>保存图片</button></div><div class="runway-table-wrap" role="region" aria-label="本金与年消费速查表" tabindex="0"></div><div class="runway-legend">${["≤1 年", "1–5", "5–15", "15–25", "25+", "∞"].map((text, i) => `<span><i class="runway-band-${i}"></i>${text}</span>`).join("")}</div></section>
    <p class="leisure-footnote">按固定收益、年末支出测算</p><div class="leisure-error" role="status"></div>
  </div>`;
  const form = body.querySelector("form");
  const resultEl = body.querySelector(".retirement-result");
  const tableWrap = body.querySelector(".runway-table-wrap");
  const save = body.querySelector("[data-save-runway]");
  let latest;

  function update() {
    body.querySelectorAll("[data-period]").forEach((button) => {
      const selected = button.dataset.period === values.period;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    if (!form.checkValidity()) {
      resultEl.innerHTML = '<div class="runway-empty">填写完整参数</div>';
      tableWrap.innerHTML = "";
      save.disabled = true;
      latest = null;
      return;
    }
    try {
      values = {
        ...values,
        ...Object.fromEntries(
          [...new FormData(form)].map(([key, value]) => [key, Number(value)]),
        ),
      };
      latest = runway(values);
      const { points, rate, annual } = latest;
      const peak = Math.max(...points, 1);
      const path = points
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"}${((i / Math.max(1, points.length - 1)) * 400).toFixed(2)},${(82 - (p / peak) * 74).toFixed(2)}`,
        )
        .join(" ");
      resultEl.innerHTML = `<span class="runway-caption">${latest.perpetual ? "理论永续" : "理论可支撑"}</span><div class="runway-number"><strong>${runwayLabel(latest)}</strong>${latest.perpetual ? "" : "<span>年</span>"}</div><div class="runway-stats"><span>年消费<strong>¥${number(annual)}</strong></span><span>实际收益率<strong>${number(rate * 100)}%</strong></span></div><div class="runway-chart"><svg viewBox="0 0 400 90" role="img" aria-label="剩余本金走势"><path d="${path} L400,90 L0,90 Z" fill="currentColor" opacity=".07"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg><div><span>现在</span><span>${latest.perpetual ? "30" : runwayLabel(latest)} 年后</span></div></div>`;
      tableWrap.innerHTML = `<table class="runway-table"><thead><tr><th scope="col">本金 / 年消费</th>${expenses.map((n) => `<th scope="col">${n / 10000} 万</th>`).join("")}</tr></thead><tbody>${principals
        .map(
          (principal) =>
            `<tr><th scope="row">${principal / 10000} 万</th>${expenses
              .map((annual) => {
                const value = runway({
                  ...values,
                  principal,
                  spending: annual,
                  period: "year",
                });
                const active =
                  principal === values.principal &&
                  Math.abs(annual - latest.annual) < 0.01;
                return `<td><button type="button" class="runway-cell runway-band-${runwayBand(value)}${active ? " current" : ""}" data-principal="${principal}" data-annual="${annual}" aria-pressed="${active}" aria-label="本金 ${principal / 10000} 万，年消费 ${annual / 10000} 万，${value.perpetual ? "理论永续" : `可支撑 ${runwayLabel(value)} 年`}">${runwayLabel(value)}</button></td>`;
              })
              .join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
      save.disabled = false;
      body.querySelector(".leisure-error").textContent = "";
    } catch (error) {
      body.querySelector(".leisure-error").textContent = error.message;
      save.disabled = true;
    }
  }
  form.onsubmit = (event) => event.preventDefault();
  form.oninput = update;
  body.querySelectorAll("[data-period]").forEach(
    (button) =>
      (button.onclick = () => {
        if (values.period === button.dataset.period) return;
        const input = form.elements.spending;
        input.value = Number(
          (
            Number(input.value) *
            (button.dataset.period === "year" ? 12 : 1 / 12)
          ).toFixed(6),
        );
        values.period = button.dataset.period;
        update();
      }),
  );
  tableWrap.onclick = (event) => {
    const cell = event.target.closest("[data-principal]");
    if (!cell) return;
    form.elements.principal.value = cell.dataset.principal;
    form.elements.spending.value =
      Number(cell.dataset.annual) / (values.period === "month" ? 12 : 1);
    update();
  };
  save.onclick = async () => {
    if (!latest) return;
    save.disabled = true;
    try {
      await saveImage(values, latest);
    } catch {
      body.querySelector(".leisure-error").textContent = "图片保存失败，请重试";
    } finally {
      save.disabled = false;
    }
  };
  update();
}

async function saveImage(input, result) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1480;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  ctx.fillStyle = "#f2f2f7";
  ctx.fillRect(0, 0, 800, 740);
  const text = (value, x, y, size = 15, color = "#1c1c1e", weight = 500) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px -apple-system, "Microsoft YaHei", sans-serif`;
    ctx.fillText(value, x, y);
  };
  text("躺平计算器", 36, 50, 24, "#1c1c1e", 650);
  text(result.perpetual ? "理论永续" : "理论可支撑", 36, 96, 16, "#6e6e73");
  text(
    `${runwayLabel(result)}${result.perpetual ? "" : " 年"}`,
    32,
    166,
    64,
    "#178574",
    650,
  );
  text(
    `本金 ¥${number(input.principal)}   年消费 ¥${number(result.annual)}`,
    36,
    209,
  );
  text(
    `年化收益 ${input.returns}%   通胀 ${input.inflation}%`,
    36,
    237,
    15,
    "#6e6e73",
  );
  text("本金 × 年消费", 36, 285, 19, "#1c1c1e", 600);
  ctx.textAlign = "center";
  text("万元", 65, 329, 13, "#6e6e73");
  expenses.forEach((n, col) => text(String(n / 10000), 140 + col * 72, 329));
  principals.forEach((principal, row) => {
    const y = 348 + row * 39;
    text(String(principal / 10000), 65, y + 23);
    expenses.forEach((annual, col) => {
      const value = runway({
        ...input,
        principal,
        spending: annual,
        period: "year",
      });
      ctx.fillStyle = colors[runwayBand(value)];
      ctx.beginPath();
      ctx.roundRect(107 + col * 72, y, 66, 33, 7);
      ctx.fill();
      text(runwayLabel(value), 140 + col * 72, y + 23, 14);
    });
  });
  ctx.textAlign = "left";
  text("按固定收益、年末支出测算 · 金额按当前购买力", 36, 709, 13, "#6e6e73");
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("export failed");
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "躺平测算.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
