import {
  randomIndex,
  parseChoices,
  drawChoices,
  jiaobeiResult,
} from "./leisure-core.js";

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const palette = [
  "#6399ce",
  "#72b2ac",
  "#9c99c5",
  "#d7ad78",
  "#cd8c97",
  "#829dc2",
  "#9dac78",
  "#b59cc7",
];
const state = {
  mode: "jiaobei",
  question: "",
  cups: [true, false],
  throws: [],
  totalThrows: 0,
  streak: 0,
  wheelText: "看书\n散步\n看电影\n做运动\n听音乐\n休息",
  wheelResult: "",
  rotation: 0,
  lotText: "一号签\n二号签\n三号签\n四号签\n五号签\n六号签",
  count: 1,
  unique: true,
  drawn: [],
  lotResult: [],
};

function cup(flat, id) {
  return `<svg viewBox="0 0 140 230" aria-hidden="true"><defs><linearGradient id="cup-${id}" x1="0" y1="0" x2="1" y2=".65"><stop offset="0" stop-color="${flat ? "#d97760" : "#7c2527"}"/><stop offset=".48" stop-color="${flat ? "#bc5344" : "#d9745c"}"/><stop offset="1" stop-color="${flat ? "#a64038" : "#792b2c"}"/></linearGradient><linearGradient id="shine-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe4b5" stop-opacity=".5"/><stop offset="1" stop-color="#ffe4b5" stop-opacity="0"/></linearGradient></defs><path d="M114 17C-13 19-12 210 114 213C62 163 62 66 114 17Z" fill="#662a28" transform="translate(0 5)"/><path d="M114 17C-13 19-12 210 114 213C62 163 62 66 114 17Z" fill="url(#cup-${id})" stroke="#8c3d34" stroke-width="1.5"/>${flat ? '<path d="M98 30C2 48 4 184 99 201M82 43C16 72 18 166 81 189" fill="none" stroke="#f1b48e" stroke-opacity=".22" stroke-width="1.4"/>' : `<path d="M72 36C21 68 23 158 65 184" fill="none" stroke="url(#shine-${id})" stroke-width="13" stroke-linecap="round"/><path d="M88 27C2 50 9 193 102 207" fill="none" stroke="#e49c7b" stroke-opacity=".38" stroke-width="1.4"/>`}</svg>`;
}

function wheelSvg(items) {
  const wedge = 360 / items.length;
  const point = (angle, radius) => [
    180 + radius * Math.cos((angle * Math.PI) / 180),
    180 + radius * Math.sin((angle * Math.PI) / 180),
  ];
  return `<svg viewBox="0 0 360 360" role="img" aria-label="${items.length} 个选项的转盘">${items
    .map((item, i) => {
      const a = -90 + i * wedge,
        b = a + wedge,
        middle = a + wedge / 2;
      const p1 = point(a, 176),
        p2 = point(b, 176),
        label = point(middle, items.length > 12 ? 135 : 112);
      const shape =
        items.length === 1
          ? '<circle cx="180" cy="180" r="176"'
          : `<path d="M180 180L${p1}A176 176 0 ${wedge > 180 ? 1 : 0} 1 ${p2}Z"`;
      return `${shape} fill="${palette[i % palette.length]}" stroke="var(--workspace-surface)" stroke-width="2"/><text x="${label[0]}" y="${label[1]}" text-anchor="middle" dominant-baseline="central" transform="rotate(${middle + 90} ${label})" fill="#fff" font-size="${items.length > 16 ? 10 : 14}" font-weight="600">${escape(item.length > 7 ? item.slice(0, 6) + "…" : item)}</text>`;
    })
    .join(
      "",
    )}<circle cx="180" cy="180" r="27" fill="var(--workspace-surface)"/><circle cx="180" cy="180" r="7" fill="var(--workspace-border-strong)"/></svg>`;
}

export function renderFortune(body) {
  let disposed = false,
    busy = false;
  const animations = new Set();
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = async (element, frames, options) => {
    const animation = element.animate(frames, {
      ...options,
      duration: reduced() ? 1 : options.duration,
    });
    animations.add(animation);
    try {
      await animation.finished;
    } catch {
      /* Leaving the app cancels its animation. */
    }
    animations.delete(animation);
  };
  function lock(value) {
    busy = value;
    body.setAttribute("aria-busy", String(value));
    body
      .querySelectorAll("button,input,textarea")
      .forEach((el) => (el.disabled = value));
  }
  function draw() {
    body.innerHTML = `<div class="fortune-tool"><div class="tool-segment fortune-tabs" aria-label="抽签方式">${[
      ["jiaobei", "掷杯筊"],
      ["wheel", "自定义转盘"],
      ["lots", "抽签"],
    ]
      .map(
        ([id, text]) =>
          `<button type="button" data-fortune-tab="${id}" class="${state.mode === id ? "selected" : ""}" aria-pressed="${state.mode === id}">${text}</button>`,
      )
      .join(
        "",
      )}</div><div class="fortune-content"></div><div class="leisure-error" role="status"></div></div>`;
    const content = body.querySelector(".fortune-content");
    if (state.mode === "jiaobei") drawCups(content);
    else if (state.mode === "wheel") drawWheel(content);
    else drawLots(content);
    body.querySelectorAll("[data-fortune-tab]").forEach(
      (button) =>
        (button.onclick = () => {
          state.mode = button.dataset.fortuneTab;
          draw();
        }),
    );
  }
  async function act(operation) {
    if (busy) return;
    body.querySelector(".leisure-error").textContent = "";
    lock(true);
    try {
      await operation();
    } catch (error) {
      if (!disposed)
        body.querySelector(".leisure-error").textContent = error.message;
    } finally {
      if (!disposed) lock(false);
    }
  }
  function drawCups(content) {
    const last = state.throws[0];
    content.innerHTML = `<section class="leisure-panel jiaobei-panel"><input class="jiaobei-question" aria-label="所问之事" placeholder="心中所问（可不填）" maxlength="120" value="${escape(state.question)}"><div class="jiaobei-stage">${state.cups.map((flat, i) => `<div class="cup-position cup-position-${i}"><div class="cup-piece">${cup(flat, i)}</div><span class="cup-face">${flat ? "平面" : "凸面"}</span></div>`).join("")}</div><div class="fortune-result jiaobei-result" aria-live="polite">${last ? `<strong>${last.name}</strong><span>${last.meaning}</span>` : '<strong class="fortune-placeholder">—</strong>'}</div><button type="button" class="primary fortune-go" data-cast>掷杯筊</button><div class="jiaobei-log"></div></section>`;
    content.querySelector(".jiaobei-question").oninput = (event) => {
      state.question = event.target.value;
    };
    cupHistory();
    content.querySelector("[data-cast]").onclick = () =>
      act(async () => {
        const faces = [randomIndex(2) === 0, randomIndex(2) === 0];
        content.querySelector(".jiaobei-result").innerHTML =
          '<strong class="fortune-placeholder">· · ·</strong>';
        content
          .querySelectorAll(".cup-face")
          .forEach((el) => (el.style.visibility = "hidden"));
        await Promise.all(
          [...content.querySelectorAll(".cup-piece")].map((el, i) =>
            animate(
              el,
              [
                { transform: "translateY(0) rotate(0deg) rotateY(0deg)" },
                {
                  transform: `translate(${i ? 22 : -22}px,-65px) rotate(${i ? 190 : -170}deg) rotateY(270deg)`,
                  offset: 0.45,
                },
                {
                  transform: `translateY(5px) rotate(${i ? 375 : -375}deg) rotateY(720deg)`,
                  offset: 0.8,
                },
                {
                  transform: `translateY(0) rotate(${i ? 360 : -360}deg) rotateY(720deg)`,
                },
              ],
              { duration: 1250 + i * 100, easing: "ease-in-out" },
            ),
          ),
        );
        if (disposed) return;
        state.cups = faces;
        const outcome = jiaobeiResult(...faces);
        state.totalThrows++;
        state.streak = outcome.kind === "yes" ? state.streak + 1 : 0;
        state.throws.unshift({ ...outcome, question: state.question });
        state.throws = state.throws.slice(0, 50);
        content
          .querySelectorAll(".cup-piece")
          .forEach((el, i) => (el.innerHTML = cup(faces[i], i)));
        content.querySelectorAll(".cup-face").forEach((el, i) => {
          el.textContent = faces[i] ? "平面" : "凸面";
          el.style.visibility = "";
        });
        content.querySelector(".jiaobei-result").innerHTML =
          `<strong>${outcome.name}</strong><span>${outcome.meaning}</span>`;
        cupHistory();
      });
  }
  function cupHistory() {
    const log = body.querySelector(".jiaobei-log");
    if (!state.throws.length) {
      log.innerHTML = "";
      return;
    }
    const count = state.streak;
    log.innerHTML = `<div class="fortune-log-title"><span>${count ? `连续圣筊 ${count} 次` : `已掷 ${state.totalThrows} 次`}</span><button type="button" data-clear-cups>清空记录</button></div><div class="fortune-history">${state.throws
      .slice(0, 12)
      .map(
        (item) =>
          `<span class="fortune-chip ${item.kind}" title="${escape(item.question)}">${item.name}</span>`,
      )
      .join("")}</div>`;
    log.querySelector("[data-clear-cups]").onclick = () => {
      state.throws = [];
      state.totalThrows = 0;
      state.streak = 0;
      draw();
    };
  }
  function drawWheel(content) {
    content.innerHTML = `<div class="fortune-layout"><section class="leisure-panel fortune-display"><div class="wheel-stage"><i class="wheel-pointer"></i><div class="fortune-wheel"></div></div><div class="fortune-result wheel-result" aria-live="polite"><strong>${escape(state.wheelResult || "—")}</strong></div><button type="button" class="primary fortune-go" data-spin>转一下</button></section><section class="leisure-panel fortune-editor"><label>转盘选项<textarea aria-label="转盘选项" rows="8" spellcheck="false" placeholder="每行一个选项">${escape(state.wheelText)}</textarea></label><span class="fortune-count"></span></section></div>`;
    const wheel = content.querySelector(".fortune-wheel");
    function refresh() {
      try {
        const items = parseChoices(state.wheelText, 32);
        wheel.innerHTML = wheelSvg(items);
        wheel.style.transform = `rotate(${state.rotation}deg)`;
        content.querySelector(".fortune-count").textContent =
          `${items.length} 个选项`;
        body.querySelector(".leisure-error").textContent = "";
        content.querySelector("[data-spin]").disabled = false;
      } catch (error) {
        wheel.innerHTML = "";
        content.querySelector(".fortune-count").textContent = error.message;
        content.querySelector("[data-spin]").disabled = true;
      }
    }
    content.querySelector("textarea").oninput = (event) => {
      state.wheelText = event.target.value;
      state.rotation = 0;
      state.wheelResult = "";
      content.querySelector(".wheel-result strong").textContent = "—";
      refresh();
    };
    content.querySelector("[data-spin]").onclick = () =>
      act(async () => {
        const items = parseChoices(state.wheelText, 32),
          selected = randomIndex(items.length);
        const target = (360 - ((selected + 0.5) * 360) / items.length) % 360;
        const next =
          state.rotation +
          1800 +
          ((target - (state.rotation % 360) + 360) % 360);
        content.querySelector(".wheel-result strong").textContent = "· · ·";
        await animate(
          wheel,
          [
            { transform: `rotate(${state.rotation}deg)` },
            { transform: `rotate(${next}deg)` },
          ],
          { duration: 3400, easing: "cubic-bezier(.12,.7,.08,1)" },
        );
        if (disposed) return;
        state.rotation = next % 360;
        wheel.style.transform = `rotate(${state.rotation}deg)`;
        state.wheelResult = items[selected];
        content.querySelector(".wheel-result strong").textContent =
          state.wheelResult;
      });
    refresh();
  }
  function drawLots(content) {
    content.innerHTML = `<div class="fortune-layout"><section class="leisure-panel fortune-display"><div class="lot-stage" aria-hidden="true"><div class="lot-sticks">${Array.from({ length: 7 }, (_, i) => `<i style="--stick:${i}"></i>`).join("")}</div><div class="lot-cup"><span>签</span></div></div><div class="fortune-result lot-result" aria-live="polite">${state.lotResult.length ? state.lotResult.map((item) => `<strong>${escape(item)}</strong>`).join("") : '<strong class="fortune-placeholder">—</strong>'}</div><button type="button" class="primary fortune-go" data-draw-lots>抽一签</button></section><section class="leisure-panel fortune-editor"><label>签池<textarea aria-label="签池" rows="7" spellcheck="false" placeholder="每行一个选项">${escape(state.lotText)}</textarea></label><div class="lot-settings"><label>每次抽取<input aria-label="每次抽取" type="number" min="1" max="200" step="1" value="${state.count}"></label><label class="tool-check"><input type="checkbox" data-unique ${state.unique ? "checked" : ""}>不重复抽取</label></div><div class="fortune-log-title"><span class="lot-remaining"></span><button type="button" data-reset-lots>重置签池</button></div></section></div>`;
    const available = () => {
      const all = parseChoices(state.lotText);
      return state.unique
        ? all.filter((item) => !state.drawn.includes(item))
        : all;
    };
    function refresh() {
      try {
        const remaining = available();
        content.querySelector(".lot-remaining").textContent =
          `剩余 ${remaining.length} 签`;
        content.querySelector("[data-draw-lots]").textContent = remaining.length
          ? state.count > 1
            ? `抽 ${state.count} 签`
            : "抽一签"
          : "已抽完";
        content.querySelector("[data-draw-lots]").disabled = !remaining.length;
      } catch (error) {
        content.querySelector(".lot-remaining").textContent = error.message;
        content.querySelector("[data-draw-lots]").disabled = true;
      }
    }
    content.querySelector("textarea").oninput = (event) => {
      state.lotText = event.target.value;
      state.drawn = [];
      state.lotResult = [];
      content.querySelector(".lot-result").innerHTML =
        '<strong class="fortune-placeholder">—</strong>';
      refresh();
    };
    content.querySelector('[type="number"]').oninput = (event) => {
      state.count = Number(event.target.value);
      refresh();
    };
    content.querySelector("[data-unique]").onchange = (event) => {
      state.unique = event.target.checked;
      state.drawn = [];
      refresh();
    };
    content.querySelector("[data-reset-lots]").onclick = () => {
      state.drawn = [];
      state.lotResult = [];
      draw();
    };
    content.querySelector("[data-draw-lots]").onclick = async () => {
      await act(async () => {
        const { picked } = drawChoices(available(), state.count);
        content.querySelector(".lot-result").innerHTML =
          '<strong class="fortune-placeholder">· · ·</strong>';
        await animate(
          content.querySelector(".lot-stage"),
          [
            { transform: "rotate(0deg)" },
            { transform: "rotate(-9deg)" },
            { transform: "rotate(9deg)" },
            { transform: "rotate(-6deg)" },
            { transform: "rotate(6deg)" },
            { transform: "rotate(0deg)" },
          ],
          { duration: 850, easing: "ease-in-out" },
        );
        if (disposed) return;
        state.lotResult = picked;
        if (state.unique) state.drawn.push(...picked);
        content.querySelector(".lot-result").innerHTML = picked
          .map((item) => `<strong>${escape(item)}</strong>`)
          .join("");
      });
      if (!disposed) refresh();
    };
    refresh();
  }
  draw();
  return () => {
    disposed = true;
    animations.forEach((animation) => animation.cancel());
    body.removeAttribute("aria-busy");
  };
}
