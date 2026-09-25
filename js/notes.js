// =========================================================
// notes.js —— 笔记面板：本地始终保存；登录后同时同步云端
// =========================================================

import { App, NOTE_KEY, readNoteLocal, writeNoteLocal, extractErrMsg } from "./store.js?v=43";

const notesPanel = document.getElementById("notesPanel");
const notesToggle = document.getElementById("notesToggle");
const noteText = document.getElementById("noteText");
const noteStatus = document.getElementById("noteStatus");

let noteSaveTimer = null;

export function setNoteStatus(text) {
    noteStatus.textContent = text;
}

export function getNoteValue() {
    return noteText.value;
}

export function setNoteValue(text) {
    noteText.value = text;
    writeNoteLocal(text);
}

function saveNoteLocal() {
    writeNoteLocal(noteText.value);
}

function saveNote() {
    saveNoteLocal();
    if (!App.currentUser || !App.supabaseClient) {
        setNoteStatus("已保存到本地 ✓");
        return;
    }
    setNoteStatus("正在同步到云端…");
    App.supabaseClient
        .from("notes")
        .upsert({ user_id: App.currentUser.id, content: noteText.value, updated_at: new Date().toISOString() })
        .then(({ error }) => {
            setNoteStatus(error ? "云同步失败：" + extractErrMsg(error) : "已保存并同步到云端 ✓");
        });
}

noteText.addEventListener("input", () => {
    setNoteStatus("编辑中…");
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(saveNote, 600);
});

notesToggle.addEventListener("click", () => {
    const now = Date.now();
    // window 级防抖：跨模块实例也只触发一次
    if (window.__lastNoteToggle && now - window.__lastNoteToggle < 500) return;
    window.__lastNoteToggle = now;
    const open = notesPanel.hidden;
    notesPanel.hidden = !open;
    notesToggle.classList.toggle("active", open);
    if (open) noteText.focus();
});

// 初始化：恢复本地笔记
noteText.value = readNoteLocal();
