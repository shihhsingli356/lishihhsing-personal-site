import {
  dateDifference,
  shiftDate,
  parseDate,
  pageRange,
} from "./tool-core.js";
import { renderRetirement } from "./retirement-tool.js";
import { renderFortune } from "./fortune-tool.js";
import "./leisure-tools.css";

const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const appNames = {
  date: "日期计算",
  pdf: "PDF 工具",
  retirement: "躺平计算器",
  fortune: "抽签器",
};
const appIcons = {
  date: '<rect x="8" y="10" width="32" height="30" rx="6"/><path d="M8 20h32M16 7v7M32 7v7M16 27h5M27 27h5M16 33h5"/>',
  pdf: '<path d="M15 5h15l9 9v24a5 5 0 0 1-5 5H15a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5Z"/><path d="M29 5v10h10M17 24h15M17 30h15M17 36h8"/>',
  retirement:
    '<path d="M7 18v21m34-21v21M7 32h34M11 32v-9h26v9M15 23v-9h18v9"/><path d="M22 9h11l-11 9h11"/>',
  fortune:
    '<path d="M11 20h26l-3 20H14l-3-20ZM16 20l-3-12m11 12V6m8 14 3-12"/><path d="m24 26 1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L19 29.5l3.5-.5Z"/>',
};
const icon = (kind) =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${appIcons[kind]}</svg>`;
const btn = (label, action, extra = "") =>
  `<button type="button" data-tool="${action}" ${extra}>${label}</button>`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
let current = "home";
let mode = "pages";
let pages = [],
  sources = [],
  images = [],
  busy = false,
  generation = 0;
let pdfPromise;
let mountedRoot;
const pdfEngine = () =>
  (pdfPromise ||= Promise.all([
    import("pdf-lib"),
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, viewer, worker]) => {
    viewer.GlobalWorkerOptions.workerSrc = worker.default;
    return { lib, viewer };
  }));
function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function clean() {
  generation++;
  pages.forEach((p) => URL.revokeObjectURL(p.preview));
  images.forEach((p) => URL.revokeObjectURL(p.url));
  sources.forEach((s) => s.viewer.destroy());
  pages = [];
  sources = [];
  images = [];
}
export function renderTools(container) {
  if (mountedRoot) {
    container.replaceChildren(mountedRoot);
    return;
  }
  container.innerHTML = '<div class="tools-root"></div>';
  const root = container.firstElementChild;
  mountedRoot = root;
  let disposeApp;
  const draw = () => {
    disposeApp?.();
    disposeApp = undefined;
    if (current === "home") {
      root.innerHTML = `<div class="tool-desktop">${Object.entries(appNames)
        .map(
          ([id, name]) =>
            `<button type="button" class="tool-app" data-tool="open-${id}"><span class="tool-app-icon ${id}">${icon(id)}</span><span>${name}</span></button>`,
        )
        .join("")}</div>`;
      return;
    }
    root.innerHTML = `<div class="tool-top">${btn("‹ 工具", "home")}<h2>${appNames[current]}</h2>${current === "pdf" ? '<span class="tool-local">本地处理</span>' : ""}</div><div class="tool-body"></div>`;
    if (current === "date") drawDate(root.querySelector(".tool-body"));
    else if (current === "retirement")
      renderRetirement(root.querySelector(".tool-body"));
    else if (current === "fortune")
      disposeApp = renderFortune(root.querySelector(".tool-body"));
    else drawPdf(root.querySelector(".tool-body"));
  };
  function drawDate(body) {
    body.innerHTML = `<div class="tool-segment">${btn("日期间隔", "date-diff", 'class="selected"')}${btn("日期推算", "date-shift")}</div><div id="date-panel"></div>`;
    datePanel("diff");
  }
  function datePanel(tab) {
    root
      .querySelectorAll(".tool-segment button")
      .forEach((b) =>
        b.classList.toggle("selected", b.dataset.tool === `date-${tab}`),
      );
    const panel = root.querySelector("#date-panel");
    panel.innerHTML = `<form class="tool-date-form" data-date-mode="${tab}"><div class="tool-fields"><label>${tab === "diff" ? "开始日期" : "起始日期"}<input name="start" type="date" value="${today()}" required min="0001-01-01" max="9999-12-31"></label>${tab === "diff" ? `<label>结束日期<input name="end" type="date" value="${today()}" required min="0001-01-01" max="9999-12-31"></label>` : `<label>方向<select name="direction"><option value="1">往后</option><option value="-1">往前</option></select></label><label>数量<input name="amount" type="number" min="0" max="100000" step="1" value="30" required></label><label>单位<select name="unit"><option value="day">天</option><option value="week">周</option><option value="month">月</option><option value="year">年</option><option value="weekday">工作日（周一至周五）</option></select></label>`}</div>${tab === "diff" ? '<label class="tool-check"><input name="inclusive" type="checkbox">包含结束当天</label>' : ""}<button class="primary" type="submit">计算</button><output class="date-result" aria-live="polite"></output></form>`;
    panel.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target),
        output = panel.querySelector("output");
      try {
        if (tab === "diff") {
          const { days, weekdays } = dateDifference(
            f.get("start"),
            f.get("end"),
            f.has("inclusive"),
          );
          output.innerHTML = `<div><strong>${days}</strong><span>天</span></div><p>${Math.floor(days / 7)} 周 ${days % 7} 天</p><p>${weekdays} 个工作日（周一至周五）</p>`;
        } else {
          const date = shiftDate(
            f.get("start"),
            Number(f.get("amount")) * Number(f.get("direction")),
            f.get("unit"),
          );
          const d = parseDate(date);
          output.innerHTML = `<div class="date-answer">${date.replaceAll("-", " / ")}</div><p>${new Intl.DateTimeFormat("zh-CN", { weekday: "long", timeZone: "UTC" }).format(d)}</p><p>${new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { dateStyle: "long", timeZone: "UTC" }).format(d)}</p>`;
        }
      } catch (error) {
        output.textContent = error.message;
      }
    };
  }
  function drawPdf(body) {
    body.innerHTML = `<div class="tool-segment">${[
      ["pages", "PDF 页面"],
      ["split", "PDF 拆分"],
      ["images", "图片转 PDF"],
      ["convert", "图片处理"],
    ]
      .map(([id, label]) =>
        btn(label, "mode-" + id, `class="${mode === id ? "selected" : ""}"`),
      )
      .join(
        "",
      )}</div><div class="tool-file-actions">${btn(mode === "pages" || mode === "split" ? "添加 PDF" : "添加图片", "add", 'class="primary"')}${btn("清空", "clear")}</div><input class="tool-file" type="file" multiple accept="${mode === "pages" || mode === "split" ? ".pdf,application/pdf" : "image/jpeg,image/png,image/webp"}" hidden><div class="tool-options"></div><div class="tool-status" role="status" aria-live="polite"></div><div class="tool-items"></div><div class="tool-bottom"></div>`;
    const options = body.querySelector(".tool-options");
    if (mode === "split")
      options.innerHTML =
        '<label>拆分方式<select id="split-type"><option value="each">每页一个文件</option><option value="range">提取指定页码</option><option value="groups">按范围拆成多个文件</option></select></label><label>页码范围<input id="split-range" placeholder="1-3,5；多个文件用分号分隔"></label>';
    if (mode === "images")
      options.innerHTML =
        '<label>纸张<select id="image-paper"><option value="a4">A4</option><option value="original">适应图片</option></select></label><label>方向<select id="image-direction"><option value="portrait">纵向</option><option value="landscape">横向</option></select></label><label>页边距<select id="image-margin"><option value="24">留白</option><option value="0">无</option></select></label>';
    if (mode === "convert")
      options.innerHTML =
        '<label>格式<select id="image-format"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label><label>质量 <output id="quality-value">80%</output><input id="image-quality" type="range" min="10" max="100" value="80"></label><label>最长边（像素）<input id="image-size" type="number" min="1" max="16000" placeholder="保留原尺寸"></label>';
    const range = body.querySelector("#image-quality");
    if (range)
      range.oninput = () => {
        body.querySelector("#quality-value").textContent = range.value + "%";
      };
    const format = body.querySelector("#image-format");
    if (format)
      format.onchange = () => {
        lock();
        body.querySelector("#quality-value").textContent =
          format.value === "image/png" ? "无损" : range.value + "%";
      };
    body.querySelector(".tool-file").onchange = async (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      await run(() => addFiles(files));
    };
    const drop = body.querySelector(".tool-items");
    drop.ondragover = (e) => {
      e.preventDefault();
      drop.classList.add("drag-over");
    };
    drop.ondragleave = () => drop.classList.remove("drag-over");
    drop.ondrop = async (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      if (busy) return;
      const from = e.dataTransfer.getData("text/tool-page");
      if (from !== "") {
        const target = e.target.closest("[data-index]");
        if (target) reorder(Number(from), Number(target.dataset.index));
      } else await run(() => addFiles([...e.dataTransfer.files]));
    };
    items();
  }
  function status(text) {
    const el = root.querySelector(".tool-status");
    if (el) el.textContent = text;
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    lock();
    try {
      await fn();
    } catch (error) {
      status(error.message || "处理失败，请检查文件后重试");
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
      lock();
    }
  }
  function lock() {
    root
      .querySelectorAll("button,input,select")
      .forEach((el) => (el.disabled = busy));
    if (!busy) {
      const count =
        mode === "pages" || mode === "split" ? pages.length : images.length;
      root
        .querySelector('[data-tool="move-left"][data-index="0"]')
        ?.setAttribute("disabled", "");
      root
        .querySelector(`[data-tool="move-right"][data-index="${count - 1}"]`)
        ?.setAttribute("disabled", "");
      if (root.querySelector("#image-format")?.value === "image/png")
        root.querySelector("#image-quality").disabled = true;
    }
  }
  function items() {
    const list = root.querySelector(".tool-items");
    if (!list) return;
    const isPdf = mode === "pages" || mode === "split",
      data = isPdf ? pages : images;
    list.innerHTML = data.length
      ? data
          .map(
            (p, i) =>
              `<div class="tool-page" data-index="${i}" draggable="true"><div class="tool-preview"><img src="${isPdf ? p.preview : p.url}" alt="${esc(isPdf ? "第 " + (i + 1) + " 页" : p.file.name)}" style="transform:rotate(${p.turn || 0}deg)"></div><div class="tool-page-name" title="${esc(p.name || p.file?.name || "")}">${isPdf ? `${i + 1} · ${esc(p.name)}` : esc(p.file.name)}</div><div class="tool-page-controls">${btn("←", "move-left", `data-index="${i}" aria-label="前移第 ${i + 1} 项" ${i === 0 ? "disabled" : ""}`)}${btn("→", "move-right", `data-index="${i}" aria-label="后移第 ${i + 1} 项" ${i === data.length - 1 ? "disabled" : ""}`)}${isPdf ? btn("↻", "rotate", `data-index="${i}" aria-label="旋转第 ${i + 1} 页"`) : ""}${btn("×", "remove", `data-index="${i}" aria-label="删除第 ${i + 1} 项"`)}</div>${mode === "pages" ? `<label class="tool-check"><input type="checkbox" data-select="${i}" ${p.selected ? "checked" : ""}>选择</label>` : ""}</div>`,
          )
          .join("")
      : `<button class="tool-drop" type="button" data-tool="add"><span class="tool-drop-symbol">＋</span><span>${isPdf ? "选择或拖入 PDF" : "选择或拖入图片"}</span></button>`;
    list
      .querySelectorAll("[draggable]")
      .forEach(
        (el) =>
          (el.ondragstart = (e) =>
            e.dataTransfer.setData("text/tool-page", el.dataset.index)),
      );
    list
      .querySelectorAll("[data-select]")
      .forEach(
        (el) =>
          (el.onchange = () =>
            (pages[Number(el.dataset.select)].selected = el.checked)),
      );
    root.querySelector(".tool-bottom").innerHTML = data.length
      ? `<span>${data.length} ${isPdf ? "页" : "张图片"}</span><div>${mode === "pages" ? btn("全选", "select-all") + btn("提取所选", "extract") : ""}${btn(mode === "split" ? "拆分并下载" : mode === "convert" ? "转换并下载" : mode === "images" ? "生成 PDF" : "导出 PDF", "export", 'class="primary"')}</div>`
      : "";
    if (busy) lock();
  }
  function reorder(from, to) {
    const data = mode === "pages" || mode === "split" ? pages : images;
    if (to < 0 || to >= data.length) return;
    data.splice(to, 0, data.splice(from, 1)[0]);
    items();
  }
  async function addFiles(files) {
    const token = generation;
    status("正在读取…");
    for (const file of files) {
      if (token !== generation) return;
      if (mode === "pages" || mode === "split") {
        if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf")
          throw new Error("请选择 PDF 文件");
        const { lib, viewer } = await pdfEngine();
        const bytes = new Uint8Array(await file.arrayBuffer());
        let doc;
        try {
          doc = await lib.PDFDocument.load(bytes);
        } catch {
          throw new Error(`${file.name} 无法打开，请使用未加密的 PDF`);
        }
        const loading = viewer.getDocument({
          data: bytes.slice(),
          isEvalSupported: false,
        });
        loading.onPassword = () => loading.destroy();
        const v = await loading.promise;
        const source = { doc, viewer: v };
        sources.push(source);
        for (let index = 0; index < doc.getPageCount(); index++) {
          const page = await v.getPage(index + 1),
            base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(1, 240 / base.width),
          });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
          const blob = await new Promise((resolve) => canvas.toBlob(resolve));
          pages.push({
            source,
            index,
            name: file.name,
            turn: 0,
            selected: false,
            preview: URL.createObjectURL(blob),
          });
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
      } else {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
          throw new Error("支持 JPG、PNG 和 WebP 图片");
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        images.push({ file, url: URL.createObjectURL(file) });
      }
      items();
    }
    status("");
  }
  async function makePdf(selection) {
    const { lib } = await pdfEngine();
    const result = await lib.PDFDocument.create();
    for (const p of selection) {
      const [copy] = await result.copyPages(p.source.doc, [p.index]);
      copy.setRotation(lib.degrees((copy.getRotation().angle + p.turn) % 360));
      result.addPage(copy);
    }
    return result.save();
  }
  async function exportFiles(selected = false) {
    status("正在处理…");
    if (mode === "pages") {
      const selection = selected ? pages.filter((p) => p.selected) : pages;
      if (!selection.length) throw new Error("请先选择页面");
      download(
        await makePdf(selection),
        selected ? "提取页面.pdf" : "合并文档.pdf",
        "application/pdf",
      );
    } else if (mode === "split") {
      const type = root.querySelector("#split-type").value,
        value = root.querySelector("#split-range").value;
      const groups =
        type === "each"
          ? pages.map((_, i) => [i])
          : (type === "range" ? [value] : value.split(/[;；]/)).map((v) =>
              pageRange(v, pages.length),
            );
      if (groups.length === 1)
        download(
          await makePdf(groups[0].map((i) => pages[i])),
          "拆分文档.pdf",
          "application/pdf",
        );
      else {
        const { zipSync } = await import("fflate");
        const files = {};
        for (let i = 0; i < groups.length; i++)
          files[`part-${String(i + 1).padStart(3, "0")}.pdf`] = await makePdf(
            groups[i].map((n) => pages[n]),
          );
        download(
          zipSync(files, { level: 0 }),
          "拆分文档.zip",
          "application/zip",
        );
      }
    } else if (mode === "images") {
      const { lib } = await pdfEngine();
      const doc = await lib.PDFDocument.create();
      for (const { file } of images) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const img =
          file.type === "image/jpeg"
            ? await doc.embedJpg(bytes)
            : await doc.embedPng(
                file.type === "image/png"
                  ? bytes
                  : await raster(file, "image/png", 1, 0),
              );
        const original =
            root.querySelector("#image-paper").value === "original",
          landscape =
            root.querySelector("#image-direction").value === "landscape";
        const size = original
          ? [img.width, img.height]
          : landscape
            ? [841.89, 595.28]
            : [595.28, 841.89];
        const margin = original
            ? 0
            : Number(root.querySelector("#image-margin").value),
          scale = Math.min(
            (size[0] - 2 * margin) / img.width,
            (size[1] - 2 * margin) / img.height,
          );
        const page = doc.addPage(size);
        page.drawImage(img, {
          x: (size[0] - img.width * scale) / 2,
          y: (size[1] - img.height * scale) / 2,
          width: img.width * scale,
          height: img.height * scale,
        });
      }
      download(await doc.save(), "图片文档.pdf", "application/pdf");
    } else {
      const type = root.querySelector("#image-format").value,
        quality = Number(root.querySelector("#image-quality").value) / 100;
      const raw = root.querySelector("#image-size").value,
        max = raw ? Number(raw) : 0;
      if (raw && (!Number.isInteger(max) || max < 1 || max > 16000))
        throw new Error("最长边请输入 1–16000 的整数");
      const ext = type.split("/")[1].replace("jpeg", "jpg"),
        output = {};
      for (let i = 0; i < images.length; i++)
        output[
          `${i + 1}-${images[i].file.name.replace(/\.[^.]+$/, "")}.${ext}`
        ] = await raster(images[i].file, type, quality, max);
      if (images.length === 1) {
        const [name, bytes] = Object.entries(output)[0];
        download(bytes, name, type);
      } else {
        const { zipSync } = await import("fflate");
        download(
          zipSync(output, { level: 0 }),
          "处理后的图片.zip",
          "application/zip",
        );
      }
    }
    status("已下载");
  }
  root.onclick = async (e) => {
    const b = e.target.closest("[data-tool]");
    if (!b || busy) return;
    const action = b.dataset.tool,
      index = Number(b.dataset.index);
    if (action === "home") {
      clean();
      current = "home";
      draw();
    } else if (action.startsWith("open-")) {
      current = action.slice(5);
      draw();
    } else if (action.startsWith("date-")) datePanel(action.slice(5));
    else if (action.startsWith("mode-")) {
      mode = action.slice(5);
      draw();
    } else if (action === "add") root.querySelector(".tool-file").click();
    else if (action === "clear") {
      clean();
      items();
      status("");
    } else if (action === "move-left") reorder(index, index - 1);
    else if (action === "move-right") reorder(index, index + 1);
    else if (action === "rotate") {
      pages[index].turn = (pages[index].turn + 90) % 360;
      items();
    } else if (action === "remove") {
      const data = mode === "pages" || mode === "split" ? pages : images;
      const [p] = data.splice(index, 1);
      URL.revokeObjectURL(p.preview || p.url);
      items();
    } else if (action === "select-all") {
      const selected = !pages.every((p) => p.selected);
      pages.forEach((p) => (p.selected = selected));
      items();
    } else if (action === "extract" || action === "export")
      await run(() => exportFiles(action === "extract"));
  };
  draw();
}
async function raster(file, type, quality, max) {
  const image = await createImageBitmap(file);
  const scale = max
    ? Math.min(1, max / Math.max(image.width, image.height))
    : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (type === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
  canvas.width = canvas.height = 0;
  if (!blob || blob.type !== type)
    throw new Error("当前浏览器不支持此图片格式");
  return new Uint8Array(await blob.arrayBuffer());
}
