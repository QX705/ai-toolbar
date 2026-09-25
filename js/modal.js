// =========================================================
// modal.js —— 添加 / 编辑工具弹窗
// =========================================================

import { App, CATEGORIES, normalizeUrl, extractErrMsg } from "./store.js?v=38";
import { addTool, updateTool, renderGrid } from "./tools.js?v=38";

const modalMask = document.getElementById("modalMask");
const modalTitle = document.getElementById("modalTitle");
const toolForm = document.getElementById("toolForm");
const toolName = document.getElementById("toolName");
const toolUrl = document.getElementById("toolUrl");
const toolCategory = document.getElementById("toolCategory");
const formError = document.getElementById("formError");
const saveToolBtn = document.getElementById("saveToolBtn");

function fillCategorySelect(selected) {
    toolCategory.innerHTML = "";
    CATEGORIES.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        opt.selected = cat === selected;
        toolCategory.appendChild(opt);
    });
}

export function openToolModal(tool = null) {
    App.editingId = tool ? tool.id : null;
    modalTitle.textContent = tool ? "编辑工具" : "添加工具";
    toolName.value = tool ? tool.name : "";
    toolUrl.value = tool ? tool.url : "";
    fillCategorySelect(tool ? tool.category : App.activeCategory === "全部" ? "其他" : App.activeCategory);
    formError.textContent = "";
    modalMask.hidden = false;
    toolName.focus();
}

function closeModal() {
    modalMask.hidden = true;
    App.editingId = null;
}

document.getElementById("addBtn").addEventListener("click", () => openToolModal());
document.getElementById("cancelBtn").addEventListener("click", closeModal);
modalMask.addEventListener("click", (e) => {
    if (e.target === modalMask) closeModal();
});

toolForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = toolName.value.trim();
    const url = normalizeUrl(toolUrl.value);

    if (!name) return;
    if (!url) {
        formError.textContent = "网址格式不正确，请检查后重试";
        return;
    }

    saveToolBtn.disabled = true;

    const finish = () => {
        saveToolBtn.disabled = false;
        closeModal();
        renderGrid();
    };

    let action;
    if (App.editingId !== null) {
        const tool = App.tools.find((t) => t.id === App.editingId);
        if (!tool) { saveToolBtn.disabled = false; return; }
        action = updateTool(tool, name, url, toolCategory.value);
    } else {
        action = addTool(name, url, toolCategory.value);
    }

    action.then(finish).catch((err) => {
        saveToolBtn.disabled = false;
        formError.textContent = "保存失败：" + extractErrMsg(err);
    });
});

// Esc 关闭（由 main.js 统一调度时调用）
export function tryCloseToolModal() {
    if (!modalMask.hidden) closeModal();
}
