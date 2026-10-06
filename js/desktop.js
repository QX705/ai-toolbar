// =========================================================
// desktop.js —— 桌面模式：全屏启动器（壁纸 + 时钟/农历 + 搜索 + 应用网格 + 分类 Dock）
// 数据与其他视图同源：直接读 App.tools（登录后经 Supabase 云端同步），
// 添加/编辑复用现有弹窗，删除复用 tools.js 的 removeTool。
// 壁纸与搜索引擎偏好存本浏览器 localStorage。
// =========================================================

import { App, avatarColor, escapeHtml, iconSources, CATEGORIES } from "./store.js?v=1.0.14";
import { ENGINES, WALLPAPERS, CAT_ICONS, PET_PART_BOXES } from "./content.js?v=1.0.14";
import { openToolModal } from "./modal.js?v=1.0.14";
import { removeTool } from "./tools.js?v=1.0.14";

const desktopToggle = document.getElementById("desktopToggle");
const desktopSection = document.getElementById("desktopSection");
const dtRoot = document.getElementById("dtRoot");
const dtTime = document.getElementById("dtTime");
const dtDate = document.getElementById("dtDate");
const dtSearchForm = document.getElementById("dtSearchForm");
const dtSearchInput = document.getElementById("dtSearchInput");
const dtDock = document.getElementById("dtDock");
const dtGrid = document.getElementById("dtGrid");
const dtNotesBtn = document.getElementById("dtNotesBtn");
const dtStudyBtn = document.getElementById("dtStudyBtn");
const dtExitBtn = document.getElementById("dtExitBtn");
const dtWallpaperPop = document.getElementById("dtWallpaperPop");
const dtWpPresets = document.getElementById("dtWpPresets");
const dtWallpaperUrl = document.getElementById("dtWallpaperUrl");
const dtWpApply = document.getElementById("dtWpApply");
const dtWpReset = document.getElementById("dtWpReset");

// ===== 搜索引擎 =====
const WALLPAPER_KEY = "ai-toolbar-wallpaper";

let active = false;
let clockTimer = null;
let dtCat = null; // null = 显示全部

// ===== 自由布局：图标吸附到格子，时钟/搜索/Dock 可拖到任意位置 =====
const LAYOUT_KEY = "ai-toolbar-dt-layout";
const CELL_H = 136; // 行距
let layout = (() => {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch { return {}; }
})();
layout.icons = layout.icons || {};
layout.widgets = layout.widgets || {};
const saveLayout = () => localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
let cols = 1;
let cellW = 118; // 列宽按窗口宽度均分，默认排布铺满整行

function gridMetrics() {
    const w = dtGrid.clientWidth;
    cols = Math.max(1, Math.floor((w + 14) / 118));
    cellW = w / cols;
}
function resolvePos(id, used) {
    const saved = layout.icons[id];
    if (saved) {
        const p = { c: Math.max(0, Math.min(saved.c, cols - 1)), r: Math.max(0, saved.r) };
        used.add(p.c + "," + p.r);
        return p;
    }
    // 没有手动位置：按阅读顺序找第一个空闲格
    for (let r = 0; ; r++) {
        for (let c = 0; c < cols; c++) {
            const k = c + "," + r;
            if (!used.has(k)) { used.add(k); return { c, r }; }
        }
    }
}
function makeIconDraggable(tile, tool) {
    tile.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".dt-act")) return;
        const startX = e.clientX, startY = e.clientY;
        const gRect = dtGrid.getBoundingClientRect();
        const tileR = tile.getBoundingClientRect();
        const offX = e.clientX - tileR.left, offY = e.clientY - tileR.top;
        let moved = false;
        const onMove = (ev) => {
            if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
            moved = true;
            tile.classList.add("dt-dragging");
            tile.style.left = ev.clientX - gRect.left - offX + "px";
            tile.style.top = ev.clientY - gRect.top - offY + "px";
        };
        const onUp = (ev) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            tile.classList.remove("dt-dragging");
            if (!moved) return; // 没拖动 = 普通点击，交给 click 打开网站
            tile.dataset.dragged = "1";
            // 吸附到最近格子，目标被占则与对方换位
            const cx = ev.clientX - gRect.left - offX + 53;
            const cy = ev.clientY - gRect.top - offY + 57;
            const c = Math.max(0, Math.min(cols - 1, Math.floor(cx / cellW)));
            const r = Math.max(0, Math.floor(cy / CELL_H));
            const hit = Object.entries(layout.icons).find(([id, p]) => Number(id) !== tool.id && p.c === c && p.r === r);
            if (hit) {
                const mine = resolvePos(tool.id);
                layout.icons[hit[0]] = { c: mine.c, r: mine.r };
            }
            layout.icons[tool.id] = { c, r };
            saveLayout();
            renderGridDt();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    });
}
function makeWidgetDraggable(el, key, isFixed) {
    el.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("input")) return;
        const startX = e.clientX, startY = e.clientY;
        const elR = el.getBoundingClientRect();
        const offX = e.clientX - elR.left, offY = e.clientY - elR.top;
        let moved = false;
        const onMove = (ev) => {
            if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
            moved = true;
            el.classList.add("dt-dragging");
            if (isFixed) { // Dock：相对视口固定
                el.style.left = ev.clientX - offX + "px";
                el.style.top = ev.clientY - offY + "px";
                el.style.right = "auto";
                el.style.bottom = "auto";
            } else {       // 时钟/搜索：相对桌面容器
                const rootR = dtRoot.getBoundingClientRect();
                el.style.position = "absolute";
                el.style.margin = "0";
                el.style.left = ev.clientX - rootR.left + dtRoot.scrollLeft - offX + "px";
                el.style.top = ev.clientY - rootR.top + dtRoot.scrollTop - offY + "px";
            }
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            el.classList.remove("dt-dragging");
            if (!moved) return;
            el.dataset.dragged = "1";
            const r = el.getBoundingClientRect();
            layout.widgets[key] = isFixed
                ? { x: Math.round(r.left), y: Math.round(r.top) }
                : { x: Math.round(r.left - dtRoot.getBoundingClientRect().left + dtRoot.scrollLeft),
                    y: Math.round(r.top - dtRoot.getBoundingClientRect().top + dtRoot.scrollTop) };
            saveLayout();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    });
}
function applyLayout() {
    [["clock", document.querySelector(".dt-clock")], ["search", dtSearchForm], ["pet", petEl]].forEach(([key, el]) => {
        if (!el) return;
        const p = layout.widgets[key];
        if (p) {
            el.classList.add("dt-free-widget");
            el.style.left = p.x + "px";
            el.style.top = p.y + "px";
        } else {
            el.classList.remove("dt-free-widget");
            el.style.left = el.style.top = el.style.position = el.style.margin = "";
        }
    });
    const dp = layout.widgets.dock;
    if (dp) {
        dtDock.classList.add("dt-free-widget");
        dtDock.style.left = dp.x + "px";
        dtDock.style.top = dp.y + "px";
        dtDock.style.right = "auto";
        dtDock.style.bottom = "auto";
    } else {
        dtDock.classList.remove("dt-free-widget");
        dtDock.style.left = dtDock.style.top = dtDock.style.right = dtDock.style.bottom = "";
    }
}
let resizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (active) renderGridDt(); }, 200);
});

// ===== 农历日（Intl 自带中国历，免手写换算表）=====
function lunarText(d) {
    try {
        const fmt = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "numeric", day: "numeric" });
        const parts = {};
        for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
        const leap = String(parts.month).includes("闰");
        const mNum = parseInt(String(parts.month).replace(/[^0-9]/g, ""), 10);
        const dNum = parseInt(String(parts.day).replace(/[^0-9]/g, ""), 10);
        if (!mNum || !dNum) return parts.month + parts.day; // 兜底：浏览器输出意外格式时原样显示
        const M = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
        const D = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
        const dayCN = (n) => (n === 10 ? "初十" : n === 20 ? "二十" : n === 30 ? "三十"
            : n < 10 ? "初" + D[n - 1] : n < 20 ? "十" + D[n - 11] : "廿" + D[n - 21]);
        return (leap ? "闰" : "") + M[mNum - 1] + dayCN(dNum);
    } catch (e) {
        return "";
    }
}

function tick() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    dtTime.innerHTML = `${p(d.getHours())}:${p(d.getMinutes())}<span class="dt-sec">:${p(d.getSeconds())}</span>`;
    dtDate.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 星期${"日一二三四五六"[d.getDay()]} ${lunarText(d)}`;
}

// ===== 壁纸 =====
function applyWallpaper() {
    let wp = null;
    try { wp = JSON.parse(localStorage.getItem(WALLPAPER_KEY) || "null"); } catch (e) { /* 忽略坏数据 */ }
    if (wp && wp.type === "url" && wp.value) {
        dtRoot.style.background = `#101020 url("${wp.value.replace(/"/g, "%22")}") center/cover no-repeat fixed`;
    } else if (wp && wp.type === "css" && wp.value) {
        dtRoot.style.background = wp.value;
    } else {
        dtRoot.style.background = WALLPAPERS[0].css;
    }
    renderWpPresets();
}

function renderWpPresets() {
    let wp = null;
    try { wp = JSON.parse(localStorage.getItem(WALLPAPER_KEY) || "null"); } catch (e) { /* 忽略 */ }
    const cur = wp && wp.type === "css" ? wp.value : WALLPAPERS[0].css;
    dtWpPresets.innerHTML = WALLPAPERS.map((w) =>
        `<button class="dt-wp-chip${w.css === cur ? " active" : ""}" type="button" data-wp="${w.id}" title="${w.name}" style="background:${w.css}"></button>`).join("");
}

function saveWallpaper(wp) {
    localStorage.setItem(WALLPAPER_KEY, JSON.stringify(wp));
    applyWallpaper();
}

// ===== 搜索引擎条 =====
// ===== Dock（分类）=====
function dockCategories() {
    const extra = [...new Set(App.tools.map((t) => t.category || "其他"))];
    const all = [];
    for (const c of CATEGORIES) if (!all.includes(c)) all.push(c);
    for (const c of extra) if (!all.includes(c)) all.push(c);
    return all;
}

const catIcon = (c) => CAT_ICONS[c] || "📁";

let dockOpen = false;
function renderDock() {
    const cats = dockCategories().reverse(); // 反转按钮顺序
    dtDock.innerHTML =
        `<div class="dt-dock-panel${dockOpen ? " open" : ""}">` +
        cats.map((c) => `<button class="dt-dock-btn${c === dtCat ? " active" : ""}" type="button" data-cat="${c}" title="${c}">${catIcon(c)}</button>`).join("") +
        `<span class="dt-dock-sep"></span>` +
        `<button class="dt-dock-btn" type="button" data-act="add" title="添加应用">＋</button>` +
        `<button class="dt-dock-btn" type="button" data-act="wallpaper" title="桌面背景">🖼️</button>` +
        `<button class="dt-dock-btn" type="button" data-act="reset" title="恢复默认布局">↺</button>` +
        `</div>` +
        `<button class="dt-dock-handle${dockOpen ? " active" : ""}" id="dtDockHandle" type="button" title="${dockOpen ? "收起分类" : "展开分类"}">🗂️</button>`;
}

// ===== 应用网格 =====
function visibleApps() {
    return App.tools.filter((t) => !dtCat || (t.category || "其他") === dtCat);
}

function buildApp(tool) {
    const tile = document.createElement("div");
    tile.className = "dt-app";
    tile.title = tool.url;
    tile.innerHTML = `
        <div class="dt-app-actions">
            <button class="dt-act" data-act="edit" title="编辑">✏️</button>
            <button class="dt-act" data-act="del" title="删除">🗑️</button>
        </div>
        <div class="dt-app-icon"><span class="dt-app-letter">${[...tool.name][0] || "?"}</span><img alt="" draggable="false" referrerpolicy="no-referrer"></div>
        <div class="dt-app-name">${tool.name}</div>`;
    tile.querySelector(".dt-app-name").textContent = tool.name; // 双保险防注入

    // 图标：复用与卡片一致的候选源逻辑，全部失败则用彩色字母块
    const icon = tile.querySelector(".dt-app-icon");
    const img = icon.querySelector("img");
    const sources = iconSources(tool.url);
    let idx = 0;
    let timer = null;
    const next = () => {
        clearTimeout(timer);
        idx++;
        if (idx < sources.length) {
            img.src = sources[idx];
            timer = setTimeout(next, 8000);
        } else {
            img.remove();
            icon.classList.add("fallback");
            icon.style.background = avatarColor(tool.name);
        }
    };
    img.addEventListener("load", () => { clearTimeout(timer); img.classList.add("loaded"); });
    img.addEventListener("error", next);
    if (sources.length) {
        img.src = sources[0];
        timer = setTimeout(next, 8000);
    } else next();

    tile.addEventListener("click", (e) => {
        if (tile.dataset.dragged) { delete tile.dataset.dragged; return; } // 拖拽结束后的 click 不当作点击
        const act = e.target.closest(".dt-act");
        if (act) {
            e.stopPropagation();
            if (act.dataset.act === "edit") openToolModal(tool);
            else removeTool(tool);
            return;
        }
        window.open(tool.url, "_blank", "noopener");
    });
    return tile;
}

function renderGridDt() {
    gridMetrics();
    dtGrid.innerHTML = "";
    const list = visibleApps();
    if (!list.length) {
        dtGrid.style.height = "auto";
        dtGrid.innerHTML = `<div class="dt-empty">${dtCat ? "这个分类还没有应用" : "还没有应用，点左侧 ＋ 添加"}</div>`;
        return;
    }
    let maxR = 0;
    const used = new Set(Object.entries(layout.icons).map(([, p]) =>
        Math.max(0, Math.min(p.c, cols - 1)) + "," + Math.max(0, p.r)));
    list.forEach((t) => {
        const p = resolvePos(t.id, used);
        const tile = buildApp(t);
        tile.classList.add("dt-free");
        tile.style.left = p.c * cellW + (cellW - 106) / 2 + "px";
        tile.style.top = p.r * CELL_H + "px";
        makeIconDraggable(tile, t);
        maxR = Math.max(maxR, p.r);
        dtGrid.appendChild(tile);
    });
    dtGrid.style.height = (maxR + 1) * CELL_H + "px";
}

// ===== 视图切换 =====
function setDesktop(on) {
    active = on;
    desktopSection.hidden = !on;
    document.body.classList.toggle("desktop-mode", on);
    if (on) {
        applyWallpaper();
        applyLayout();
        renderDock();
        renderGridDt();
        tick();
        clockTimer = setInterval(tick, 1000);
        dtSearchInput.focus();
    } else {
        clearInterval(clockTimer);
        clockTimer = null;
        dtWallpaperPop.hidden = true;
    }
}

// ===== 事件 =====
if (desktopToggle) {
    desktopToggle.addEventListener("click", () => {
        const now = Date.now();
        if (window.__lastDesktopToggle && now - window.__lastDesktopToggle < 500) return;
        window.__lastDesktopToggle = now;
        setDesktop(!active);
    });
}

dtSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = dtSearchInput.value.trim();
    if (!q) return;
    const eng = ENGINES[0];
    window.open(eng.url + encodeURIComponent(q), "_blank", "noopener");
});

dtDock.addEventListener("click", (e) => {
    if (dtDock.dataset.dragged) { delete dtDock.dataset.dragged; return; } // 拖完不走点击
    if (e.target.closest("#dtDockHandle")) {
        dockOpen = !dockOpen;
        renderDock();
        // 展开后若面板超出屏幕（左缘或右缘），把整个 Dock 平移收进屏幕
        if (dockOpen) {
            requestAnimationFrame(() => {
                const panel = dtDock.querySelector(".dt-dock-panel");
                if (!panel) return;
                const pr = panel.getBoundingClientRect();
                let shift = 0;
                if (pr.left < 10) shift = 10 - pr.left;
                else if (pr.right > innerWidth - 10) shift = (innerWidth - 10) - pr.right;
                if (shift) {
                    const cur = dtDock.getBoundingClientRect();
                    dtDock.style.left = Math.max(10, cur.left + shift) + "px";
                    dtDock.style.right = "auto";
                    const r2 = dtDock.getBoundingClientRect();
                    layout.widgets.dock = { x: Math.round(r2.left), y: Math.round(r2.top) };
                    saveLayout();
                }
            });
        }
        return;
    }
    const btn = e.target.closest("button");
    if (!btn) return;
    let handled = false;
    if (btn.dataset.cat) {
        dtCat = (dtCat === btn.dataset.cat) ? null : btn.dataset.cat; // 再点一次当前分类 = 回到全部
        renderDock();
        renderGridDt();
        handled = true;
    } else if (btn.dataset.act === "add") {
        openToolModal();
        handled = true;
    } else if (btn.dataset.act === "wallpaper") {
        dtWallpaperPop.hidden = !dtWallpaperPop.hidden;
        handled = true;
    } else if (btn.dataset.act === "reset") {
        layout = { icons: {}, widgets: {} };
        saveLayout();
        applyLayout();
        renderGridDt();
        handled = true;
    }
    if (handled) { dockOpen = false; renderDock(); } // 选完自动收起
});

dtWpPresets.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-wp]");
    if (!chip) return;
    const wp = WALLPAPERS.find((w) => w.id === chip.dataset.wp);
    if (wp) saveWallpaper({ type: "css", value: wp.css });
});

dtWpApply.addEventListener("click", () => {
    const url = dtWallpaperUrl.value.trim();
    if (!/^https?:\/\//i.test(url)) return;
    saveWallpaper({ type: "url", value: url });
    dtWallpaperPop.hidden = true;
});

dtWpReset.addEventListener("click", () => {
    localStorage.removeItem(WALLPAPER_KEY);
    applyWallpaper();
});

// 工具数据在任何视图里变化（增删改/云同步/恢复默认）→ 桌面网格即时刷新
window.addEventListener("tools-changed", () => {
    if (active) { renderDock(); renderGridDt(); }
});

// Esc 退出桌面（弹窗打开时优先让弹窗处理）
window.addEventListener("keydown", (e) => {
    if (!active || e.key !== "Escape") return;
    const maskOpen = ["modalMask", "authMask", "pwMask"].some((id) => {
        const el = document.getElementById(id);
        return el && !el.hidden;
    });
    if (maskOpen) return;
    setDesktop(false);
});

// 快捷入口：退出桌面并打开对应视图
function jumpTo(btnId) {
    setDesktop(false);
    const btn = document.getElementById(btnId);
    if (btn) btn.click();
}
// ===== 桌宠：粉毛猫耳娘（assets/pet.webp 原图分层，与登录页同款形象）=====
const petEl = document.createElement("div");
petEl.className = "dt-pet";
petEl.title = "点我有惊喜，拖我换位置";
petEl.innerHTML = `
    <div class="dt-pet-bubble"></div>
    <div class="dt-pet-body">
        <canvas class="dt-layer" data-layer="base"></canvas>
        <canvas class="dt-layer" data-layer="earL"></canvas>
        <canvas class="dt-layer" data-layer="earR"></canvas>
        <canvas class="dt-layer" data-layer="pawL"></canvas>
        <canvas class="dt-layer" data-layer="pawR"></canvas>
    </div>
    <div class="dt-pet-launch" hidden>
        <input class="dt-pet-launch-input" type="text" placeholder="输入应用名，回车跳转" autocomplete="off" />
        <div class="dt-pet-launch-list"></div>
    </div>`;
dtRoot.appendChild(petEl);
const petBubble = petEl.querySelector(".dt-pet-bubble");
const petBody = petEl.querySelector(".dt-pet-body");
const petLaunch = petEl.querySelector(".dt-pet-launch");
const petLaunchInput = petLaunch.querySelector("input");
const petLaunchList = petLaunch.querySelector(".dt-pet-launch-list");
let bubbleTimer = null, sleepTimer = null, petRaf = 0;
let launcherOpen = false, launcherMatches = [];

function petSay(text) {
    petBubble.textContent = text;
    petBubble.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => petBubble.classList.remove("show"), 2600);
}
function petWake() {
    petEl.classList.remove("sleep");
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
        petEl.classList.add("sleep");
        petSay("Zzz…（点我唤醒）");
    }, 25000);
}
// ===== 快捷启动器：点桌宠 → 输应用名 → 回车直达 =====
function openLauncher() {
    launcherOpen = true;
    petLaunch.hidden = false;
    const r = petEl.getBoundingClientRect();
    petLaunch.classList.toggle("below", r.top < 210); // 桌宠靠上时输入框向下弹
    petLaunchInput.value = "";
    renderMatches("");
    setTimeout(() => petLaunchInput.focus(), 60);
}
function closeLauncher() {
    launcherOpen = false;
    petLaunch.hidden = true;
}
function renderMatches(q) {
    const kw = q.trim().toLowerCase();
    launcherMatches = kw ? App.tools.filter((t) => t.name.toLowerCase().includes(kw)).slice(0, 4) : [];
    petLaunchList.innerHTML = launcherMatches.length
        ? launcherMatches.map((t, i) => `<button class="dt-launch-row" type="button" data-idx="${i}">${escapeHtml(t.name)}</button>`).join("")
        : (kw ? `<div class="dt-launch-none">没找到「${escapeHtml(q.trim())}」</div>` : `<div class="dt-launch-none">输入名字，回车直达</div>`);
}
petEl.addEventListener("click", (e) => {
    if (e.target.closest(".dt-pet-launch")) return; // 输入框/结果列表里的点击不算点桌宠
    if (petEl.dataset.dragged) { delete petEl.dataset.dragged; return; }
    petWake();
    if (launcherOpen) { closeLauncher(); return; }
    petEl.classList.add("jump");
    setTimeout(() => petEl.classList.remove("jump"), 750);
    openLauncher();
});
dtRoot.addEventListener("mousemove", (e) => {
    petWake();
    if (petRaf) return;
    petRaf = requestAnimationFrame(() => {
        petRaf = 0;
        const r = petEl.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        petBody.style.transform = `rotate(${Math.max(-6, Math.min(6, dx / 40)).toFixed(1)}deg)`;
    });
});
petWake();

// 图层构建：与登录页同款（去白底 + 耳朵/爪子分层微动）
(async () => {
    const img = new Image();
    img.src = "assets/pet.webp";
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const src = document.createElement("canvas");
    src.width = W;
    src.height = H;
    const sctx = src.getContext("2d");
    sctx.drawImage(img, 0, 0);
    const data = sctx.getImageData(0, 0, W, H);
    const px = data.data;
    const idx = (x, y) => (y * W + x) * 4;
    const isBg = (x, y) => {
        const i = idx(x, y);
        return px[i + 3] === 0 || (px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235);
    };
    const seen = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
    for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
    while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x]) continue;
        if (!isBg(x, y)) continue;
        seen[y * W + x] = 1;
        px[idx(x, y) + 3] = 0;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = idx(x, y);
            if (px[i + 3] === 0) continue;
            const nearClear = (x > 0 && px[idx(x - 1, y) + 3] === 0) || (x < W - 1 && px[idx(x + 1, y) + 3] === 0) || (y > 0 && px[idx(x, y - 1) + 3] === 0) || (y < H - 1 && px[idx(x, y + 1) + 3] === 0);
            if (!nearClear) continue;
            const bright = (px[i] + px[i + 1] + px[i + 2]) / 3;
            if (bright > 205) px[i + 3] = Math.round(px[i + 3] * Math.max(0, 1 - (bright - 205) / 50));
        }
    }
    sctx.putImageData(data, 0, 0);
    const base = petEl.querySelector('[data-layer="base"]');
    base.width = W;
    base.height = H;
    base.getContext("2d").drawImage(src, 0, 0);
    for (const [key, box] of Object.entries(PET_PART_BOXES)) {
        const el = petEl.querySelector(`[data-layer="${key}"]`);
        el.width = W;
        el.height = H;
        el.getContext("2d").drawImage(src, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
        el.style.transformOrigin = box.origin;
    }
})().catch((e) => console.warn("桌宠图层构建失败：", e));

petLaunchInput.addEventListener("input", () => renderMatches(petLaunchInput.value));
petLaunchInput.addEventListener("keydown", (e) => {
    if (e.isComposing) return; // 中文输入法选字时的回车不触发跳转
    if (e.key === "Enter") {
        e.preventDefault();
        const kw = petLaunchInput.value.trim().toLowerCase();
        if (!launcherMatches.length) { petSay(`没找到「${kw}」喵`); return; }
        const exact = launcherMatches.find((t) => t.name.toLowerCase() === kw);
        const target = exact || launcherMatches[0];
        window.open(target.url, "_blank", "noopener");
        closeLauncher();
    } else if (e.key === "Escape") {
        e.stopPropagation(); // 只收起输入框，不退出桌面
        closeLauncher();
    }
});
petLaunchList.addEventListener("click", (e) => {
    const row = e.target.closest("[data-idx]");
    if (!row) return;
    const t = launcherMatches[Number(row.dataset.idx)];
    if (t) { window.open(t.url, "_blank", "noopener"); closeLauncher(); }
});
document.addEventListener("click", (e) => {
    if (launcherOpen && !petEl.contains(e.target)) closeLauncher();
});

dtNotesBtn.addEventListener("click", () => jumpTo("notesToggle"));
dtStudyBtn.addEventListener("click", () => jumpTo("studyJump"));

// 时钟 / 搜索框 / 桌宠 / Dock 可拖拽换位
makeWidgetDraggable(document.querySelector(".dt-clock"), "clock", false);
makeWidgetDraggable(dtSearchForm, "search", false);
makeWidgetDraggable(petEl, "pet", false);
makeWidgetDraggable(dtDock, "dock", true);
