import { today, uid, validDay, live } from "./core.js";
import {
  recordedHours,
  segmentDuration,
  periodRange,
  focusStats,
  moneyCents,
  validateFocusEdit,
} from "./activity.js";

export function createFeatures(ctx) {
  const {
    $,
    esc,
    button,
    field,
    select,
    area,
    modal,
    save,
    render,
    message,
    projectField,
  } = ctx;
  let ledgerMonth = today().slice(0, 7),
    ledgerKind = "all",
    ledgerCategory = "",
    ledgerQuery = "";
  let focusTab = "timer",
    rangeKind = "week",
    rangeDay = today(),
    rangeFrom = today(),
    rangeTo = today(),
    focusProject = "";
  let filterStart = "",
    filterEnd = "";
  const money = (cents) =>
    (cents / 100).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const categories = [
    "餐饮",
    "交通",
    "购物",
    "居住",
    "学习",
    "健康",
    "娱乐",
    "工资",
    "奖金",
    "退款",
    "其他",
  ];
  const currencies = [
    ["CNY", "人民币 CNY"],
    ["USD", "美元 USD"],
    ["HKD", "港币 HKD"],
    ["EUR", "欧元 EUR"],
    ["JPY", "日元 JPY"],
    ["GBP", "英镑 GBP"],
  ];
  const currencySymbols = {
    CNY: "¥",
    USD: "$",
    HKD: "HK$",
    EUR: "€",
    JPY: "JP¥",
    GBP: "£",
  };
  const accountTypes = [
    ["bank", "银行卡"],
    ["savings", "存款"],
    ["cash", "现金"],
    ["ewallet", "电子钱包"],
    ["credit", "信用账户"],
    ["investment", "投资账户"],
  ];
  const ledgerKinds = [
    ["expense", "支出"],
    ["income", "收入"],
    ["transfer", "转账"],
    ["investment_buy", "买入投资"],
    ["investment_sell", "卖出投资"],
  ];
  const kindName = Object.fromEntries(ledgerKinds);
  const accountTypeName = Object.fromEntries(accountTypes);
  const current = () => ctx.state();
  const focusRecords = () => current().focus.filter((r) => !r.deletedAt);
  const draftSegments = (now = Date.now()) => {
    const f = current().focusDraft;
    return f
      ? [
          ...f.segments,
          ...(f.startedAt && now > f.startedAt
            ? [{ start: f.startedAt, end: now }]
            : []),
        ]
      : [];
  };
  const elapsed = () => segmentDuration(draftSegments());
  const clock = (ms) => {
    const sec = Math.floor(ms / 1000);
    return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  };
  function rangeControls() {
    return `<form id="focus-range" class="filter-bar">
      <label>查看范围<select name="kind">${[
        ["day", "某日"],
        ["week", "某周"],
        ["month", "某月"],
        ["quarter", "某季度"],
        ["half", "某半年"],
        ["year", "某年"],
        ["custom", "自定义"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${rangeKind === v ? "selected" : ""}>${l}</option>`,
        )
        .join("")}</select></label>
      <label>基准日期<input name="day" type="date" value="${rangeDay}" required></label>
      <label>起始日期<input name="from" type="date" value="${rangeFrom}" ${rangeKind !== "custom" ? "disabled" : ""}></label>
      <label>结束日期<input name="to" type="date" value="${rangeTo}" ${rangeKind !== "custom" ? "disabled" : ""}></label>
      <label>项目<select name="project"><option value="">全部项目</option>${live(
        current(),
        "projects",
        true,
      )
        .map(
          (p) =>
            `<option value="${p.id}" ${focusProject === p.id ? "selected" : ""}>${esc(p.title)}</option>`,
        )
        .join("")}</select></label>
      <button class="primary">查看</button></form><p id="range-error" role="alert" class="warning"></p>`;
  }
  const baseCents = (record) =>
    Math.round(record.cents * Number(record.rate || 1));
  const originalMoney = (record) =>
    `${currencySymbols[record.currency || "CNY"] || record.currency} ${money(record.cents)}`;
  const activeAccounts = () =>
    current().accounts.filter((account) => !account.deletedAt);
  const accountName = (id) =>
    current().accounts.find((account) => account.id === id)?.title ||
    id ||
    "未指定账户";
  function accountBalances(cutoff) {
    const balances = new Map(
      activeAccounts().map((account) => [
        account.id,
        Math.round(account.openingCents * Number(account.rate || 1)),
      ]),
    );
    current()
      .ledger.filter((record) => !record.deletedAt && record.date <= cutoff)
      .forEach((record) => {
        const value = baseCents(record);
        if (
          balances.has(record.account) &&
          (record.kind === "income" || record.kind === "investment_sell")
        )
          balances.set(
            record.account,
            (balances.get(record.account) || 0) + value,
          );
        if (
          balances.has(record.account) &&
          (record.kind === "expense" || record.kind === "investment_buy")
        )
          balances.set(
            record.account,
            (balances.get(record.account) || 0) - value,
          );
        if (record.kind === "transfer") {
          if (balances.has(record.account))
            balances.set(record.account, balances.get(record.account) - value);
          if (balances.has(record.toAccount))
            balances.set(
              record.toAccount,
              balances.get(record.toAccount) + value,
            );
        }
      });
    return balances;
  }
  function investmentHoldings(cutoff) {
    const holdings = new Map();
    current()
      .ledger.filter(
        (record) =>
          !record.deletedAt &&
          record.date <= cutoff &&
          ["investment_buy", "investment_sell"].includes(record.kind) &&
          record.asset,
      )
      .forEach((record) => {
        const holding = holdings.get(record.asset) || {
          quantity: 0,
          invested: 0,
        };
        const direction = record.kind === "investment_buy" ? 1 : -1;
        holding.quantity += direction * Number(record.quantity || 0);
        holding.invested += direction * baseCents(record);
        holdings.set(record.asset, holding);
      });
    return holdings;
  }
  function renderLedger(c) {
    const all = current().ledger.filter(
      (record) => !record.deletedAt && record.date.startsWith(ledgerMonth),
    );
    const rows = all
      .filter(
        (record) =>
          (ledgerKind === "all" || record.kind === ledgerKind) &&
          (!ledgerCategory || record.category === ledgerCategory) &&
          (!ledgerQuery ||
            [
              record.title,
              record.memo,
              accountName(record.account),
              record.asset,
            ]
              .join(" ")
              .toLowerCase()
              .includes(ledgerQuery.toLowerCase())),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    const income = all
        .filter((record) => record.kind === "income")
        .reduce((sum, record) => sum + baseCents(record), 0),
      expense = all
        .filter((record) => record.kind === "expense")
        .reduce((sum, record) => sum + baseCents(record), 0);
    const budget = current().budgets.find(
      (record) => !record.deletedAt && record.month === ledgerMonth,
    );
    const groups = new Map();
    all
      .filter((record) => record.kind === "expense")
      .forEach((record) =>
        groups.set(
          record.category,
          (groups.get(record.category) || 0) + baseCents(record),
        ),
      );
    const balances = accountBalances(ledgerMonth + "-31"),
      deposits = [...balances.values()].reduce((sum, value) => sum + value, 0),
      holdings = investmentHoldings(ledgerMonth + "-31"),
      invested = [...holdings.values()].reduce(
        (sum, holding) => sum + holding.invested,
        0,
      );
    c.innerHTML = `<div class="row spaced"><h2>资产与收支</h2><div class="actions">${button("记一笔", "ledger-edit", "", 'class="primary"')}${button("账户", "ledger-accounts")}${button("月预算", "ledger-budget")}${button("导出", "ledger-export")}</div></div>
      <form id="ledger-filter" class="filter-bar"><label>月份<input type="month" name="month" value="${ledgerMonth}" required></label><label>类型<select name="kind">${[["all", "全部"], ...ledgerKinds].map(([value, label]) => `<option value="${value}" ${ledgerKind === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>分类<select name="category"><option value="">全部分类</option>${[...new Set([...categories, ...all.map((record) => record.category)])].map((category) => `<option ${ledgerCategory === category ? "selected" : ""}>${esc(category)}</option>`).join("")}</select></label><label>搜索<input name="query" value="${esc(ledgerQuery)}" placeholder="名称、账户或投资标的"></label><button>筛选</button></form>
      <div class="metrics ledger-metrics"><div><small>收入</small><strong>¥ ${money(income)}</strong></div><div><small>支出</small><strong>¥ ${money(expense)}</strong></div><div><small>净收支</small><strong>¥ ${money(income - expense)}</strong></div><div><small>账户资产</small><strong>¥ ${money(deposits)}</strong></div><div><small>投资净额</small><strong>¥ ${money(invested)}</strong></div><div><small>${budget ? (expense > budget.cents ? "超出预算" : "预算剩余") : "月预算"}</small><strong>${budget ? "¥ " + money(Math.abs(budget.cents - expense)) : "未设置"}</strong></div></div>
      ${budget ? `<div class="card budget-card"><div class="row"><span>预算 ¥ ${money(budget.cents)}</span><span>${Math.round((expense / budget.cents) * 100)}%</span></div><progress max="${budget.cents}" value="${Math.min(expense, budget.cents)}"></progress></div>` : ""}
      <div class="grid ledger-grid"><section class="card"><h2>账户</h2>${
        activeAccounts()
          .map((account) => {
            const base = balances.get(account.id) || 0;
            const native = Math.round(base / Number(account.rate || 1));
            return `<div class="account-row"><div><strong>${esc(account.title)}</strong><small>${esc(accountTypeName[account.type] || "账户")} · ${account.currency}</small></div><strong>${currencySymbols[account.currency] || account.currency} ${money(native)}</strong></div>`;
          })
          .join("") || '<div class="empty">还没有账户</div>'
      }</section><section class="card"><h2>投资</h2>${
        [...holdings]
          .filter(([, holding]) => holding.quantity || holding.invested)
          .map(
            ([asset, holding]) =>
              `<div class="account-row"><div><strong>${esc(asset)}</strong><small>${holding.quantity.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} 份</small></div><strong>¥ ${money(holding.invested)}</strong></div>`,
          )
          .join("") || '<div class="empty">还没有投资记录</div>'
      }</section></div>
      <div class="grid ledger-grid"><section class="card"><h2>支出分类</h2>${
        [...groups]
          .sort((a, b) => b[1] - a[1])
          .map(
            ([name, cents]) =>
              `<div class="category-row"><span>${esc(name)}</span><progress max="${Math.max(expense, 1)}" value="${cents}" aria-label="${esc(name)}支出占比"></progress><strong>¥ ${money(cents)}</strong></div>`,
          )
          .join("") || '<div class="empty">本月暂无支出</div>'
      }</section><section class="card"><h2>本月记录</h2><div class="ledger-summary"><strong>${all.length}</strong><span>笔记录</span><strong>${new Set(all.map((record) => record.date)).size}</strong><span>个记账日</span></div></section></div>
      <section class="card"><h2>明细 · ${rows.length} 笔</h2>${
        rows
          .map((record) => {
            const converted = baseCents(record);
            const sign = ["income", "investment_sell"].includes(record.kind)
              ? "+"
              : record.kind === "transfer"
                ? ""
                : "−";
            return `<div class="ledger-row"><div><strong>${esc(record.title)}</strong><small>${record.date} · ${esc(kindName[record.kind] || "账目")} · ${esc(accountName(record.account))}${record.toAccount ? " → " + esc(accountName(record.toAccount)) : ""}${record.asset ? " · " + esc(record.asset) : ""}</small>${record.memo ? `<small>${esc(record.memo)}</small>` : ""}</div><div class="ledger-amount"><strong class="${record.kind === "income" ? "income" : "expense"}">${sign}${originalMoney(record)}</strong>${record.currency !== "CNY" ? `<small>≈ ¥ ${money(converted)}</small>` : ""}</div><div class="actions">${button("编辑", "ledger-edit", record.id)}${button("删除", "delete", record.id, 'data-kind="ledger"')}</div></div>`;
          })
          .join("") || '<div class="empty">暂无匹配账目</div>'
      }</section>`;
    $("#ledger-filter").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (!validDay(f.get("month") + "-01")) return;
      ledgerMonth = f.get("month");
      ledgerKind = f.get("kind");
      ledgerCategory = f.get("category");
      ledgerQuery = f.get("query").trim();
      render();
    };
  }
  function editLedger(id) {
    const r = current().ledger.find((record) => record.id === id),
      accounts = activeAccounts(),
      accountOptions = [
        ["", "未指定账户"],
        ...accounts.map((account) => [account.id, account.title]),
      ];
    modal(
      r ? "编辑账目" : "记一笔",
      select("类型", "kind", ledgerKinds, r?.kind || "expense") +
        field("名称", "title", r?.title, "text", true) +
        field(
          "金额",
          "amount",
          r ? (r.cents / 100).toFixed(2) : "",
          "text",
          true,
        ) +
        select("币种", "currency", currencies, r?.currency || "CNY") +
        field("兑人民币汇率", "rate", r?.rate || 1, "number", true) +
        field("日期", "date", r?.date || today(), "date", true) +
        select(
          "分类",
          "category",
          [...new Set([...categories, r?.category].filter(Boolean))].map(
            (x) => [x, x],
          ),
          r?.category || "餐饮",
        ) +
        select("账户", "account", accountOptions, r?.account || "") +
        select("转入账户", "toAccount", accountOptions, r?.toAccount || "") +
        field("投资标的", "asset", r?.asset || "") +
        field("数量", "quantity", r?.quantity || "", "number") +
        projectField(r?.project || "") +
        area("备注", "memo", r?.memo),
      async (v) => {
        if (!v.title.trim() || !validDay(v.date))
          throw Error("请填写名称和有效日期");
        const entry = {
          title: v.title.trim(),
          cents: moneyCents(v.amount),
          kind: v.kind,
          currency: v.currency,
          rate: Number(v.rate),
          date: v.date,
          category:
            v.kind === "expense" || v.kind === "income" ? v.category : "",
          account: v.account,
          toAccount: v.kind === "transfer" ? v.toAccount : "",
          asset: v.kind.startsWith("investment_") ? v.asset.trim() : "",
          quantity: v.kind.startsWith("investment_") ? Number(v.quantity) : 0,
          project: v.project,
          memo: v.memo,
          updatedAt: new Date().toISOString(),
        };
        if (!Number.isFinite(entry.rate) || entry.rate <= 0)
          throw Error("请填写有效汇率");
        if (entry.kind === "transfer" && (!entry.account || !entry.toAccount))
          throw Error("请选择转出和转入账户");
        if (entry.kind === "transfer" && entry.account === entry.toAccount)
          throw Error("转出和转入账户不能相同");
        if (
          entry.kind.startsWith("investment_") &&
          (!entry.asset ||
            !Number.isFinite(entry.quantity) ||
            entry.quantity <= 0)
        )
          throw Error("请填写投资标的和数量");
        if (r) Object.assign(r, entry);
        else current().ledger.push({ id: uid(), ...entry });
        ledgerMonth = v.date.slice(0, 7);
        await save();
      },
    );
    $("#f-amount").inputMode = "decimal";
    $("#f-rate").step = "any";
    $("#f-quantity").step = "any";
    const toggleFields = () => {
      const kind = $("#f-kind").value,
        transfer = kind === "transfer",
        investment = kind.startsWith("investment_");
      $("#f-toAccount").closest(".field").hidden = !transfer;
      $("#f-asset").closest(".field").hidden = !investment;
      $("#f-quantity").closest(".field").hidden = !investment;
      $("#f-category").closest(".field").hidden = transfer || investment;
    };
    $("#f-kind").onchange = toggleFields;
    $("#f-account").onchange = () => {
      const account = accounts.find(
        (item) => item.id === $("#f-account").value,
      );
      if (!account) return;
      $("#f-currency").value = account.currency;
      $("#f-rate").value = account.rate || 1;
    };
    toggleFields();
  }
  function accountDialog(id = "") {
    const account = current().accounts.find((item) => item.id === id);
    modal(
      account ? "编辑账户" : "新建账户",
      field("账户名称", "title", account?.title, "text", true) +
        select("账户类型", "type", accountTypes, account?.type || "bank") +
        select("币种", "currency", currencies, account?.currency || "CNY") +
        field(
          "初始余额",
          "opening",
          account ? (account.openingCents / 100).toFixed(2) : "0.00",
          "text",
          true,
        ) +
        field("兑人民币汇率", "rate", account?.rate || 1, "number", true),
      async (values) => {
        if (!values.title.trim()) throw Error("请填写账户名称");
        if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(values.opening))
          throw Error("初始余额格式无效");
        const sign = values.opening.startsWith("-") ? -1 : 1,
          [whole, fraction = ""] = values.opening.replace("-", "").split("."),
          openingCents =
            sign * (Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
        const next = {
          title: values.title.trim(),
          type: values.type,
          currency: values.currency,
          openingCents,
          rate: Number(values.rate),
          updatedAt: new Date().toISOString(),
        };
        if (!Number.isFinite(next.rate) || next.rate <= 0)
          throw Error("请填写有效汇率");
        if (account) Object.assign(account, next);
        else current().accounts.push({ id: uid(), ...next });
        await save();
      },
    );
    $("#f-opening").inputMode = "decimal";
    $("#f-rate").step = "any";
  }
  function manageAccounts() {
    modal(
      "账户管理",
      `<div class="row spaced"><h3>账户</h3>${button("新建账户", "ledger-account-edit", "", 'class="primary"')}</div>${
        activeAccounts()
          .map(
            (account) =>
              `<div class="ledger-row"><div><strong>${esc(account.title)}</strong><small>${esc(accountTypeName[account.type])} · ${account.currency}</small></div><div class="actions">${button("编辑", "ledger-account-edit", account.id)}${button("删除", "delete", account.id, 'data-kind="accounts"')}</div></div>`,
          )
          .join("") || '<div class="empty">还没有账户</div>'
      }`,
      null,
    );
  }
  function renderFocus(c) {
    const f = current().focusDraft;
    c.innerHTML = `<div class="row spaced"><div class="actions">${button("计时", "focus-tab", "timer", `aria-pressed="${focusTab === "timer"}" class="${focusTab === "timer" ? "selected" : ""}"`)}${button("统计", "focus-tab", "stats", `aria-pressed="${focusTab === "stats"}" class="${focusTab === "stats" ? "selected" : ""}"`)}</div>${button("补记时长", "focus-manual")}</div>`;
    if (focusTab === "stats") {
      renderStats(c);
      return;
    }
    const tasks = live(current(), "tasks");
    c.insertAdjacentHTML(
      "beforeend",
      `<section class="focus-stage"><p id="focus-status">${f?.startedAt ? "正在专注" : f ? "已暂停" : "准备好，开始专注"}</p><button class="timer-face" id="timer-face" data-action="focus-toggle" aria-label="${f?.startedAt ? "暂停计时" : "开始或继续计时"}"><span id="focus-hours">${recordedHours(elapsed()).toFixed(1)}</span><span class="timer-unit">小时</span></button><div id="focus-clock" class="focus-clock">${clock(elapsed())}</div><div class="focus-fields"><label>正在做什么<input id="focus-title" value="${esc(f?.title || "")}" placeholder="例如：整理错题、阅读、运动" ${f ? "disabled" : ""}></label><label>关联任务（可选）<select id="focus-task" ${f ? "disabled" : ""}><option value="">不关联任务</option>${tasks.map((t) => `<option value="${t.id}" ${f?.task === t.id ? "selected" : ""}>${esc(t.title)} · ${esc(ctx.projectName(t.project))}</option>`).join("")}</select></label></div><div class="actions focus-actions">${button(f?.startedAt ? "暂停" : f ? "继续" : "开始", "focus-toggle", "", 'class="primary"')}${f ? button("结束并保存", "focus-finish") : ""}</div></section><details class="card"><summary>最近记录 · ${focusRecords().length} 次</summary>${recordList(focusRecords().slice().reverse().slice(0, 30))}</details>`,
    );
    $("#focus-task").onchange = () => {
      const t = tasks.find((t) => t.id === $("#focus-task").value);
      if (t && !$("#focus-title").value.trim())
        $("#focus-title").value = t.title;
    };
  }
  function recordList(items) {
    return (
      items
        .map(
          (r) =>
            `<div class="ledger-row"><div><strong>${esc(r.title)}</strong><small>${r.segments.length ? esc(new Date(r.segments[0].start).toLocaleString("zh-CN") + " → " + new Date(r.segments.at(-1).end).toLocaleString("zh-CN")) : ""}${r.segments.length > 1 ? " · " + r.segments.length + " 段" : ""} · ${esc(ctx.projectName(r.project))}${r.task ? " · " + esc(current().tasks.find((t) => t.id === r.task)?.title || "原任务已移除") : ""}</small></div><span>${recordedHours(segmentDuration(r.segments)).toFixed(1)} h · 实际 ${clock(segmentDuration(r.segments))}</span><div class="actions">${button("编辑", "focus-edit", r.id)}${button("删除", "delete", r.id, 'data-kind="focus"')}</div></div>`,
        )
        .join("") || '<p class="muted">暂无专注记录</p>'
    );
  }
  function renderStats(c) {
    const range = periodRange(rangeKind, rangeDay, rangeFrom, rangeTo);
    filterStart = range.start;
    filterEnd = range.end;
    const records = focusRecords().filter(
      (r) => !focusProject || r.project === focusProject,
    );
    const stats = focusStats(records, range.start, range.end),
      peak = Math.max(1, ...stats.grid.flat());
    const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const cells = stats.grid
      .map(
        (row, d) =>
          `<strong>${weekdays[d]}</strong>${row.map((minutes, h) => `<button type="button" class="heat-cell" style="--heat:${minutes ? 0.18 + (minutes / peak) * 0.82 : 0}" data-action="focus-cell" data-id="${d}-${h}" title="${weekdays[d]} ${h}:00–${h + 1}:00 · ${minutes.toFixed(1)} 分钟" aria-label="${weekdays[d]} ${h}点 ${minutes.toFixed(1)} 分钟"></button>`).join("")}`,
      )
      .join("");
    const ranks = new Map();
    stats.items.forEach((r) => {
      const name = r.task
        ? current().tasks.find((t) => t.id === r.task)?.title || r.title
        : r.title;
      ranks.set(name, (ranks.get(name) || 0) + r.duration);
    });
    c.insertAdjacentHTML(
      "beforeend",
      `${rangeControls()}<p>${range.start} → ${range.end}</p><div class="metrics"><div><small>实际专注</small><strong>${(stats.totalMs / 3600000).toFixed(2)} h</strong></div><div><small>专注次数</small><strong>${stats.items.length}</strong></div><div><small>活跃天数</small><strong>${Object.keys(stats.days).length}</strong></div><div><small>活跃日均</small><strong>${(stats.totalMs / 3600000 / Math.max(1, Object.keys(stats.days).length)).toFixed(2)} h</strong></div></div><section class="card"><h2>星期 × 小时</h2><div class="heat-scroll"><div class="heat-grid"><span></span>${Array.from({ length: 24 }, (_, h) => `<span>${h}</span>`).join("")}${cells}</div></div><div class="heat-legend"><span>少</span>${[0, 0.2, 0.45, 0.7, 1].map((n) => `<i class="heat-cell" style="--heat:${n}"></i>`).join("")}<span>多</span></div></section><div class="grid"><section class="card"><h2>事项排行</h2>${
        [...ranks]
          .sort((a, b) => b[1] - a[1])
          .map(
            ([title, ms]) =>
              `<div class="row"><span>${esc(title)}</span><strong>${(ms / 3600000).toFixed(2)} h</strong></div>`,
          )
          .join("") || '<p class="muted">此范围暂无记录</p>'
      }</section><section class="card"><h2>每日时长</h2><div class="daily-totals">${
        Object.entries(stats.days)
          .sort()
          .map(
            ([day, ms]) =>
              `<div class="row"><span>${day}</span><strong>${(ms / 3600000).toFixed(2)} h</strong></div>`,
          )
          .join("") || '<p class="muted">完成一次计时后开始积累</p>'
      }</div></section></div><details class="card"><summary>记录明细 · ${stats.items.length} 次</summary>${recordList(stats.items.slice().reverse())}</details>`,
    );
    const form = $("#focus-range");
    form.elements.kind.onchange = () => {
      const custom = form.elements.kind.value === "custom";
      form.elements.from.disabled = !custom;
      form.elements.to.disabled = !custom;
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form));
      try {
        periodRange(v.kind, v.day, v.from || v.day, v.to || v.day);
        rangeKind = v.kind;
        rangeDay = v.day;
        rangeFrom = v.from || v.day;
        rangeTo = v.to || v.day;
        focusProject = v.project;
        render();
      } catch (error) {
        $("#range-error").textContent = error.message;
      }
    };
  }
  function manualFocus(id = "") {
    const r = current().focus.find((r) => r.id === id);
    const taskOptions = [
      ["", "不关联任务"],
      ...live(current(), "tasks", true).map((t) => [t.id, t.title]),
    ];
    const localTime = (ms) => {
      const d = new Date(ms);
      return new Date(ms - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 19);
    };
    modal(
      r ? "编辑专注记录" : "补记专注",
      field("事项", "title", r?.title, "text", true) +
        select("关联任务", "task", taskOptions, r?.task || "") +
        projectField(r?.project || "") +
        (r
          ? r.segments
              .map(
                (s, i) =>
                  `<fieldset class="segment-fields"><legend>专注时段 ${i + 1}</legend><div class="grid">${field("开始时间", "segmentStart" + i, localTime(s.start), "datetime-local", true)}${field("结束时间", "segmentEnd" + i, localTime(s.end), "datetime-local", true)}</div></fieldset>`,
              )
              .join("")
          : field("开始日期", "date", today(), "date", true) +
            field("开始时间", "start", "09:00", "time", true) +
            field("结束日期", "endDate", today(), "date", true) +
            field("结束时间", "end", "10:00", "time", true)),
      async (v) => {
        if (!v.title.trim()) throw Error("请填写事项");
        const task = current().tasks.find((t) => t.id === v.task);
        const values = {
          title: v.title.trim(),
          task: v.task,
          project: task?.project || v.project,
        };
        if (r) {
          const segments = validateFocusEdit(
            r.segments.map((s, i) => ({
              start:
                new Date(v["segmentStart" + i]).getTime() ===
                Math.floor(s.start / 1000) * 1000
                  ? s.start
                  : new Date(v["segmentStart" + i]).getTime(),
              end:
                new Date(v["segmentEnd" + i]).getTime() ===
                Math.floor(s.end / 1000) * 1000
                  ? s.end
                  : new Date(v["segmentEnd" + i]).getTime(),
            })),
            [
              ...focusRecords()
                .filter((item) => item.id !== r.id)
                .flatMap((item) => item.segments),
              ...draftSegments(),
            ],
          );
          Object.assign(r, values, {
            segments,
            finishedAt: new Date(segments.at(-1).end).toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else {
          const start = new Date(v.date + "T" + v.start).getTime(),
            end = new Date(v.endDate + "T" + v.end).getTime();
          if (
            !validDay(v.date) ||
            !validDay(v.endDate) ||
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            end <= start ||
            end > Date.now()
          )
            throw Error("请填写有效的过去时间段，结束须晚于开始");
          if (end - start > 7 * 86400000) throw Error("单次补记不能超过 7 天");
          if (
            [
              ...focusRecords().flatMap((r) => r.segments),
              ...draftSegments(),
            ].some((s) => start < s.end && end > s.start)
          )
            throw Error("此时间段与已有专注记录重叠");
          current().focus.push({
            id: uid(),
            ...values,
            segments: [{ start, end }],
            finishedAt: new Date().toISOString(),
          });
        }
        await save();
      },
    );
    if (r)
      document
        .querySelectorAll('#fields input[type="datetime-local"]')
        .forEach((input) => {
          input.step = "1";
        });
  }
  async function route(action, id) {
    if (action === "ledger-edit") editLedger(id);
    else if (action === "ledger-accounts") manageAccounts();
    else if (action === "ledger-account-edit") accountDialog(id);
    else if (action === "ledger-budget") {
      const b = current().budgets.find(
        (b) => !b.deletedAt && b.month === ledgerMonth,
      );
      modal(
        ledgerMonth + " 月预算",
        field(
          "预算（元）",
          "amount",
          b ? (b.cents / 100).toFixed(2) : "",
          "text",
          true,
        ),
        async (v) => {
          const cents = moneyCents(v.amount);
          if (b) b.cents = cents;
          else
            current().budgets.push({
              id: uid(),
              title: ledgerMonth + " 月预算",
              month: ledgerMonth,
              cents,
            });
          await save();
        },
      );
    } else if (action === "ledger-export") {
      const safe = (value) =>
        '"' +
        String(value)
          .replace(/^[=+@\-\t\r]/, "\u0027$&")
          .replaceAll('"', '""') +
        '"';
      const rows = current().ledger.filter(
        (r) => !r.deletedAt && r.date.startsWith(ledgerMonth),
      );
      const csv = [
        [
          "日期",
          "类型",
          "名称",
          "金额",
          "币种",
          "汇率",
          "人民币折算",
          "分类",
          "账户",
          "转入账户",
          "投资标的",
          "数量",
          "备注",
        ],
        ...rows.map((r) => [
          r.date,
          kindName[r.kind] || r.kind,
          r.title,
          (r.cents / 100).toFixed(2),
          r.currency || "CNY",
          r.rate || 1,
          (baseCents(r) / 100).toFixed(2),
          r.category,
          accountName(r.account),
          accountName(r.toAccount),
          r.asset,
          r.quantity,
          r.memo,
        ]),
      ]
        .map((row) => row.map(safe).join(","))
        .join("\r\n");
      ctx.download(
        new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
        "账本-" + ledgerMonth + ".csv",
      );
    } else if (action === "focus-tab") {
      focusTab = id;
      render();
    } else if (action === "focus-toggle") {
      let f = current().focusDraft;
      if (!f) {
        const task = current().tasks.find(
            (t) => t.id === $("#focus-task").value,
          ),
          title = $("#focus-title").value.trim() || task?.title || "自由专注";
        f = {
          id: uid(),
          title,
          task: task?.id || "",
          project: task?.project || "",
          segments: [],
          startedAt: null,
        };
        current().focusDraft = f;
      }
      const now = Date.now();
      if (f.startedAt) {
        if (now > f.startedAt)
          f.segments.push({ start: f.startedAt, end: now });
        f.startedAt = null;
      } else f.startedAt = now;
      await save();
      render();
    } else if (action === "focus-finish") {
      const f = current().focusDraft;
      if (!f) return true;
      const segments = draftSegments();
      if (segments.length)
        current().focus.push({
          id: f.id,
          title: f.title,
          task: f.task,
          project: f.project,
          segments,
          finishedAt: new Date().toISOString(),
        });
      current().focusDraft = null;
      await save();
      render();
      message(
        "专注已保存 · " +
          recordedHours(segmentDuration(segments)).toFixed(1) +
          " 小时",
      );
    } else if (action === "focus-manual") manualFocus();
    else if (action === "focus-edit") manualFocus(id);
    else if (action === "focus-cell") {
      const [d, h] = id.split("-").map(Number);
      const stats = focusStats(
        focusRecords().filter(
          (r) => !focusProject || r.project === focusProject,
        ),
        filterStart,
        filterEnd,
      );
      const matches = stats.items.filter(
        (r) => focusStats([r], filterStart, filterEnd).grid[d][h] > 0,
      );
      modal(
        ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][d] +
          " " +
          h +
          ":00–" +
          (h + 1) +
          ":00",
        `<p>合计 ${stats.grid[d][h].toFixed(1)} 分钟</p>${matches.map((r) => `<p>${esc(r.title)} · ${focusStats([r], filterStart, filterEnd).grid[d][h].toFixed(1)} 分钟</p>`).join("") || "<p>此时段暂无记录</p>"}`,
        null,
      );
    } else return false;
    return true;
  }
  setInterval(() => {
    const face = $("#focus-hours");
    if (face) face.textContent = recordedHours(elapsed()).toFixed(1);
    const real = $("#focus-clock");
    if (real) real.textContent = clock(elapsed());
    const nav = document.querySelector('[data-view="focus"]');
    if (nav)
      nav.textContent = current().focusDraft?.startedAt
        ? "专注 · 计时中"
        : "专注";
  }, 1000);
  return { renderLedger, renderFocus, route, focusStats, focusRecords };
}
