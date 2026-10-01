// =========================================================
// notes.js —— 笔记面板（v2 重设计）：多条笔记 + Markdown
//   - 左侧：搜索 + 笔记列表（按最近编辑排序）
//   - 右侧：标题 + 工具条 + 编辑/预览 + 字数统计/导出/删除
//   - 数据：本地 localStorage；登录后整包 JSON 同步到云端 notes 表
//     （content 字段存 JSON，兼容旧版单篇纯文本，自动迁移）
//   - 未登录保存到本地；登录后自动同步；退出登录还原本地快照（cloud.js）
// =========================================================

import { App, NOTE_KEY, readNoteLocal, writeNoteLocal, escapeHtml, extractErrMsg } from "./store.js?v=1.0.0";
import { SEED_NOTE } from "./content.js?v=1.0.0";

// ===== DOM =====
const notesSection = document.getElementById("notesSection");
const notesToggle = document.getElementById("notesToggle");
const noteStatus = document.getElementById("noteStatus");
const noteSearch = document.getElementById("noteSearch");
const noteNew = document.getElementById("noteNew");
const noteList = document.getElementById("noteList");
const noteTitle = document.getElementById("noteTitle");
const noteText = document.getElementById("noteText");
const notePreview = document.getElementById("notePreview");
const notePreviewBtn = document.getElementById("notePreviewBtn");
const noteMeta = document.getElementById("noteMeta");
const noteExport = document.getElementById("noteExport");
const noteDelete = document.getElementById("noteDelete");
const notesEmpty = document.getElementById("notesEmpty");
const notesEmptyNew = document.getElementById("notesEmptyNew");
const notes2Main = document.getElementById("notes2Main");
const notes2Editor = document.getElementById("notes2Editor");

// ===== 状态 =====
let notes = [];          // [{ id, title, content, attachments, createdAt, updatedAt }]
let activeId = null;
let searchKw = "";
let previewOn = false;
let saveTimer = null;
const noteAttachBtn = document.getElementById("noteAttach");
const noteFileInput = document.getElementById("noteFileInput");
const FILE_MAX = 50 * 1024 * 1024; // 与 Supabase 免费档单文件上限一致

function setNoteStatus(text) {
    if (noteStatus) noteStatus.textContent = text;
}
export { setNoteStatus };
export function getNoteValue() {
    // cloud.js 用：返回整包 JSON；没有任何笔记时返回空串（避免上传空行）
    return notes.length ? JSON.stringify({ v: 2, notes }) : "";
}
export function setNoteValue(text) {
    // cloud.js 用：登录拉取 / 退出还原 时整体载入
    loadFrom(text);
    renderAll();
}

// ===== 数据载入 / 迁移 =====
function seedNote() {
    const now = Date.now();
        return {
            id: now + "-seed",
            title: "📝 使用指南",
            attachments: [],
            content: [
            "# 欢迎使用新笔记 ✨",
            "",
            "这里支持 **Markdown**，写完点右上角「预览」看效果。",
            "",
            "## 常用语法",
            "- **加粗** 和 *斜体*",
            "- `行内代码`",
            "- [链接](https://example.com)",
            "",
            "## 待办清单（预览里可直接点框打勾）",
            "- [x] 看一眼这篇指南",
            "- [ ] 新建一篇自己的笔记",
            "- [ ] 登录后自动同步到云端",
            "",
            "> 左侧列表可以新建多篇笔记，顶部搜索框按标题和内容查找。",
        ].join("\n"),
        createdAt: now,
        updatedAt: now,
    };
}

function loadFrom(raw) {
    const fromArg = raw !== undefined;
    const stored = fromArg ? raw : readNoteLocal();
    const firstEver = !fromArg && localStorage.getItem(NOTE_KEY) === null; // 从没用过 → 种入指南
    notes = [];
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.v === 2 && Array.isArray(parsed.notes)) {
                notes = parsed.notes
                    .filter((n) => n && typeof n.content === "string")
                    .map((n) => (n.attachments = Array.isArray(n.attachments) ? n.attachments : [], n));
            }
        } catch (e) {
            // 旧版单篇纯文本 → 迁移成一条笔记
            notes = [{
                id: "migrated",
                title: "我的笔记",
                attachments: [],
                content: String(stored),
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }];
        }
    } else if (firstEver) {
        notes = [seedNote()];
    }
    if (!notes.some((n) => n.id === activeId)) {
        activeId = notes.length ? latestNote().id : null;
    }
}

function latestNote() {
    return notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
function activeNote() {
    return notes.find((n) => n.id === activeId) || null;
}

// ===== 保存：本地立即快照 + 云端同步（与旧版一致的提示语义） =====
function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 600);
}

async function persist() {
    writeNoteLocal(getNoteValue());
    renderList();
    updateMeta();
    if (!App.currentUser || !App.supabaseClient) {
        setNoteStatus("已保存到本地 ✓");
        return;
    }
    setNoteStatus("正在同步到云端…");
    try {
        const { error } = await App.supabaseClient
            .from("notes")
            .upsert({ user_id: App.currentUser.id, content: getNoteValue(), updated_at: new Date().toISOString() });
        setNoteStatus(error ? "云同步失败：" + extractErrMsg(error) : "已保存并同步到云端 ✓");
    } catch (e) {
        setNoteStatus("云同步失败：" + extractErrMsg(e));
    }
}

// ===== Markdown 渲染 =====
function inlineMd(s) {
    // s 已经过 escapeHtml，这里只叠加行内格式
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => {
        codes.push("<code>" + c + "</code>");
        return "\x00" + (codes.length - 1) + "\x00";
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) =>
        /^\s*javascript:/i.test(url) ? m : `<img class="md-img" loading="lazy" alt="${alt}" src="${url}">`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) =>
        /^\s*javascript:/i.test(url) ? m : `<a href="${url}" target="_blank" rel="noopener">${text}</a>`);
    s = s.replace(/\x00(\d+)\x00/g, (_, i) => codes[+i]);
    return s;
}

function renderMarkdown(src) {
    const lines = escapeHtml(src).replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let mode = null;   // p | ul | ol | quote | code
    let listKind = null;
    let buf = [];

    function flush() {
        if (mode === "ul") out.push(listKind === "task" ? '<div class="md-tasks">' + buf.join("") + "</div>" : "<ul>" + buf.join("") + "</ul>");
        else if (mode === "ol") out.push("<ol>" + buf.join("") + "</ol>");
        else if (mode === "quote") out.push("<blockquote>" + buf.join("<br>") + "</blockquote>");
        else if (mode === "p") out.push("<p>" + buf.join("<br>") + "</p>");
        mode = null;
        listKind = null;
        buf = [];
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (mode === "code") {
            if (/^```/.test(line.trim())) {
                out.push("<pre><code>" + buf.join("\n") + "</code></pre>");
                mode = null; buf = [];
            } else buf.push(line);
            continue;
        }
        const t = line.trim();
        if (!t) { flush(); continue; }
        if (/^```/.test(t)) { flush(); mode = "code"; buf = []; continue; }
        const h = t.match(/^(#{1,4})\s+(.*)$/);
        if (h) { flush(); const lv = h[1].length; out.push(`<h${lv}>` + inlineMd(h[2]) + `</h${lv}>`); continue; }
        if (/^(-{3,}|\*{3,})$/.test(t)) { flush(); out.push("<hr>"); continue; }
        const task = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/);
        if (task) {
            if (mode !== "ul" || listKind !== "task") { flush(); mode = "ul"; listKind = "task"; buf = []; }
            buf.push(`<label class="md-task"><input type="checkbox" data-line="${i}"${task[1].toLowerCase() === "x" ? " checked" : ""}><span>` + inlineMd(task[2]) + "</span></label>");
            continue;
        }
        const ul = line.match(/^\s*[-*]\s+(.*)$/);
        if (ul) {
            if (mode !== "ul" || listKind === "task") { flush(); mode = "ul"; listKind = "plain"; buf = []; }
            buf.push("<li>" + inlineMd(ul[1]) + "</li>");
            continue;
        }
        const ol = line.match(/^\s*\d+[.、]\s+(.*)$/);
        if (ol) {
            if (mode !== "ol") { flush(); mode = "ol"; buf = []; }
            buf.push("<li>" + inlineMd(ol[1]) + "</li>");
            continue;
        }
        if (t.startsWith("&gt;")) {
            if (mode !== "quote") { flush(); mode = "quote"; buf = []; }
            buf.push(inlineMd(t.slice(4)));
            continue;
        }
        if (mode !== "p") { flush(); mode = "p"; buf = []; }
        buf.push(inlineMd(t));
    }
    flush();
    return out.join("");
}

// ===== 渲染 =====
function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString() === d.toDateString();
    if (sameDay) return "今天 " + hm;
    if (yesterday) return "昨天";
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + "月" + d.getDate() + "日";
    return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
}

function snippet(content) {
    const s = content.replace(/```[\s\S]*?```/g, " ").replace(/[#>*`\[\]-]/g, "").replace(/\s+/g, " ").trim();
    return s.length > 42 ? s.slice(0, 42) + "…" : s;
}

function renderList() {
    if (!noteList) return;
    const kw = searchKw.trim().toLowerCase();
    const shown = notes
        .filter((n) => !kw || (n.title + " " + n.content).toLowerCase().includes(kw))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    noteList.innerHTML = shown.length
        ? shown.map((n) => `
            <div class="notes2-item${n.id === activeId ? " active" : ""}" data-id="${n.id}">
                <div class="notes2-item-title">${escapeHtml(n.title.trim() || "无标题")}</div>
                <div class="notes2-item-snip">${escapeHtml(snippet(n.content)) || "&nbsp;"}</div>
                <div class="notes2-item-time">${escapeHtml(fmtTime(n.updatedAt))}</div>
            </div>`).join("")
        : `<div class="notes2-nomatch">${kw ? "没有匹配的笔记" : "还没有笔记，点上面新建"}</div>`;
}

function updateMeta() {
    const n = activeNote();
    if (!n) { noteMeta.textContent = ""; return; }
    const chars = n.content.replace(/\s/g, "").length;
    const tasks = n.content.match(/^\s*[-*]\s+\[( |x|X)\]/gm) || [];
    const done = tasks.filter((t) => /\[[xX]\]/.test(t)).length;
    noteMeta.textContent = `共 ${chars} 字` +
        (tasks.length ? ` · 清单 ${done}/${tasks.length}` : "") +
        (n.updatedAt ? ` · 编辑于 ${fmtTime(n.updatedAt)}` : "");
}

function renderPreview() {
    const n = activeNote();
    notePreview.innerHTML = n ? renderMarkdown(n.content) : "";
}

function renderEditor() {
    const n = activeNote();
    if (!n) return;
    noteTitle.value = n.title;
    noteText.value = n.content;
    renderPreview();
    updateMeta();
}

function renderAll() {
    const has = notes.length > 0;
    if (notes2Main) notes2Main.hidden = !has;
    if (notesEmpty) notesEmpty.hidden = has;
    if (has) {
        if (!activeNote()) activeId = latestNote().id;
        renderEditor();
    }
    renderList();
}

// ===== 编辑操作 =====
function touch(n) {
    n.updatedAt = Date.now();
    setNoteStatus("编辑中…");
    persistSoon();
}

function selectNote(id) {
    activeId = id;
    renderEditor();
    renderList();
}

function newNote() {
    const now = Date.now();
    const n = { id: now + "-" + Math.random().toString(36).slice(2, 6), title: "", content: "", attachments: [], createdAt: now, updatedAt: now };
    notes.push(n);
    activeId = n.id;
    searchKw = "";
    noteSearch.value = "";
    previewOn = false;
    applyPreviewMode();
    renderAll();
    persist();
    noteTitle.focus();
}

function deleteNote() {
    const n = activeNote();
    if (!n) return;
    if (!confirm(`确定删除「${n.title.trim() || "无标题"}」吗？`)) return;
    // 云端附件一并清理（尽力而为，失败不阻塞删除）
    if (App.supabaseClient && Array.isArray(n.attachments) && n.attachments.length) {
        App.supabaseClient.storage.from("note-files")
            .remove(n.attachments.map((a) => a.path))
            .catch(() => {});
    }
    notes = notes.filter((x) => x.id !== n.id);
    activeId = notes.length ? latestNote().id : null;
    renderAll();
    setNoteStatus("已删除 ✓");
    persistSoon();
}

function applyPreviewMode() {
    notes2Editor.classList.toggle("previewing", previewOn);
    notePreviewBtn.classList.toggle("active", previewOn);
    notePreviewBtn.title = previewOn ? "返回编辑" : "预览 Markdown 效果";
    if (previewOn) renderPreview();
}

// 工具条：包裹选中文本 / 在行首加前缀
function applyMd(action) {
    const n = activeNote();
    if (!n) return;
    const el = noteText;
    const s = el.selectionStart, e = el.selectionEnd;
    const val = el.value;
    const sel = val.slice(s, e) || (action.placeholder || "文本");
    let insert, cs, ce;
    if (action.wrap) {
        insert = action.wrap[0] + sel + action.wrap[1];
        cs = s + action.wrap[0].length; ce = cs + sel.length;
    } else {
        const lineStart = val.lastIndexOf("\n", s - 1) + 1;
        insert = action.prefix + sel;
        cs = lineStart + action.prefix.length; ce = cs + sel.length;
        // 行首插入：重排当前行
        const before = val.slice(0, lineStart), after = val.slice(lineStart);
        el.value = before + insert + after;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.focus();
        el.setSelectionRange(cs, ce);
        return;
    }
    el.value = val.slice(0, s) + insert + val.slice(e);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    el.setSelectionRange(cs, ce);
}

const MD_ACTIONS = {
    mdBold:   { wrap: ["**", "**"], placeholder: "加粗" },
    mdItalic: { wrap: ["*", "*"],   placeholder: "斜体" },
    mdCode:   { wrap: ["`", "`"],   placeholder: "代码" },
    mdLink:   { wrap: ["[", "](https://)"], placeholder: "链接文字" },
    mdHead:   { prefix: "## " },
    mdUl:     { prefix: "- " },
    mdTask:   { prefix: "- [ ] " },
    mdQuote:  { prefix: "> " },
};

// ===== 附件：存 Supabase Storage（需登录），笔记里只记元数据 =====
function fmtSize(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
}
function publicUrl(path) {
    return `${SUPABASE_URL}/storage/v1/object/public/note-files/${path.split("/").map(encodeURIComponent).join("/")}`;
}
function insertAtCursor(text) {
    const s = noteText.selectionStart, e = noteText.selectionEnd;
    noteText.value = noteText.value.slice(0, s) + text + noteText.value.slice(e);
    noteText.dispatchEvent(new Event("input", { bubbles: true }));
    noteText.focus();
    noteText.setSelectionRange(s + text.length, s + text.length);
}
async function uploadAttachment(file) {
    const note = activeNote();
    if (!note || !App.supabaseClient) return;
    const { data: sess } = await App.supabaseClient.auth.getSession();
    const token = sess && sess.session ? sess.session.access_token : null;
    if (!token) { setNoteStatus("云端会话已过期，请重新登录"); return; }
    const safeName = file.name.replace(/[\\/:*?"<>|]/g, "_");
    const path = `${App.currentUser.id}/${note.id}/${Date.now()}-${safeName}`;
    const url = `${SUPABASE_URL}/storage/v1/object/note-files/${path.split("/").map(encodeURIComponent).join("/")}`;
    setNoteStatus(`正在上传 ${safeName}…`);
    await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
        xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setNoteStatus(`正在上传 ${safeName} ${Math.round((ev.loaded / ev.total) * 100)}%…`);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                note.attachments.push({ path, name: safeName, size: file.size, type: file.type || "application/octet-stream" });
                const isImg = (file.type || "").startsWith("image/") && !/heic|heif/i.test(file.type);
                const md = isImg
                    ? `\n![${safeName}](${publicUrl(path)})\n`
                    : `\n[📄 ${safeName} (${fmtSize(file.size)})](${publicUrl(path)})\n`;
                insertAtCursor(md);
                persist();
                setNoteStatus(`${safeName} 上传完成 ✓`);
            } else {
                let msg = "上传失败（HTTP " + xhr.status + "）";
                try { msg = JSON.parse(xhr.responseText).message || msg; } catch (e) { /* 保留默认提示 */ }
                setNoteStatus(msg);
            }
            resolve();
        };
        xhr.onerror = () => { setNoteStatus("上传失败：网络错误"); resolve(); };
        xhr.send(file);
    });
}

// ===== 事件绑定 =====
if (notesToggle) {
    notesToggle.addEventListener("click", () => {
        const now = Date.now();
        if (window.__lastNoteToggle && now - window.__lastNoteToggle < 500) return;
        window.__lastNoteToggle = now;
        const open = notesSection.hidden;
        notesSection.hidden = !open;
        document.getElementById("toolSections").hidden = open;
        const es = document.getElementById("emptyState");
        if (es) es.hidden = open;
        // 笔记视图下隐藏学习通视图
        const st = document.getElementById("studySection");
        if (st) st.hidden = true;
        const sj = document.getElementById("studyJump");
        if (sj) sj.classList.remove("active");
        notesToggle.classList.toggle("active", open);
        if (open) noteText.focus();
    });
}

if (noteSearch) noteSearch.addEventListener("input", () => { searchKw = noteSearch.value; renderList(); });
if (noteNew) noteNew.addEventListener("click", newNote);
if (notesEmptyNew) notesEmptyNew.addEventListener("click", newNote);

// 附件选择（上传需登录；文件存云端，笔记里插 Markdown 引用）
if (noteAttachBtn) noteAttachBtn.addEventListener("click", () => {
    if (!App.currentUser) { setNoteStatus("附件需登录后使用（存在云端存储），请先点右上角登录"); return; }
    if (!activeNote()) { setNoteStatus("请先新建一篇笔记再插入附件"); return; }
    noteFileInput.click();
});
if (noteFileInput) noteFileInput.addEventListener("change", async () => {
    const files = [...noteFileInput.files];
    noteFileInput.value = "";
    for (const f of files) {
        if (f.size > FILE_MAX) { setNoteStatus(`「${f.name}」超过 50MB 上限，已跳过`); continue; }
        await uploadAttachment(f);
    }
});

if (noteTitle) noteTitle.addEventListener("input", () => {
    const n = activeNote();
    if (!n) return;
    n.title = noteTitle.value;
    touch(n);
});

if (noteText) noteText.addEventListener("input", () => {
    const n = activeNote();
    if (!n) return;
    n.content = noteText.value;
    if (previewOn) renderPreview();
    updateMeta();
    touch(n);
});

if (noteList) noteList.addEventListener("click", (e) => {
    const item = e.target.closest(".notes2-item");
    if (item && item.dataset.id !== activeId) selectNote(item.dataset.id);
});

// 预览区勾选清单：直接改源码里对应行
if (notePreview) notePreview.addEventListener("change", (e) => {
    const cb = e.target.closest('input[data-line]');
    const n = activeNote();
    if (!cb || !n) return;
    const lines = n.content.split("\n");
    const i = Number(cb.dataset.line);
    if (lines[i] == null) return;
    lines[i] = /\[ \]/.test(lines[i]) ? lines[i].replace("[ ]", "[x]") : lines[i].replace(/\[[xX]\]/, "[ ]");
    n.content = lines.join("\n");
    noteText.value = n.content;
    renderPreview();
    updateMeta();
    touch(n);
});

if (notePreviewBtn) notePreviewBtn.addEventListener("click", () => {
    previewOn = !previewOn;
    applyPreviewMode();
});

document.querySelectorAll("[data-md]").forEach((btn) => {
    btn.addEventListener("click", () => applyMd(MD_ACTIONS[btn.dataset.md]));
});

if (noteExport) noteExport.addEventListener("click", () => {
    const n = activeNote();
    if (!n) return;
    const name = (n.title.trim() || "笔记").replace(/[\\/:*?"<>|]/g, "_");
    const blob = new Blob(["# " + (n.title.trim() || "笔记") + "\n\n" + n.content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name + ".md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setNoteStatus("已导出 " + a.download + " ✓");
});

if (noteDelete) noteDelete.addEventListener("click", deleteNote);

// ===== 初始化 =====
loadFrom();
renderAll();
