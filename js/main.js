// =========================================================
// main.js —— 入口：初始化各模块、全局搜索、恢复默认、快捷键
// 功能代码分模块：
//   store.js  全局状态/常量/工具函数
//   tools.js  工具卡片（渲染/增删改查/分类）
//   modal.js  添加/编辑工具弹窗
//   notes.js  笔记
//   auth.js   登录/注册/修改密码
//   cloud.js  Supabase 云同步与自愈
//   map.js    学习通内嵌视图切换（原地图模块已移除）
// =========================================================

import { App, loadTools } from "./store.js?v=1.0.4";
import { renderCategories, renderGrid, onSearchInput } from "./tools.js?v=1.0.4";
import { setNoteStatus } from "./notes.js?v=1.0.4";
import { initCloud } from "./cloud.js?v=1.0.4";
import { updateAuthUI, closeAuth, closePwModal } from "./auth.js?v=1.0.4";
import { tryCloseToolModal } from "./modal.js?v=1.0.4";
import "./notes.js?v=1.0.4";
import "./auth.js?v=1.0.4";
import "./modal.js?v=1.0.4";
import "./map.js?v=1.0.4";
import "./desktop.js?v=1.0.4";

const searchInput = document.getElementById("searchInput");

// ===== 考试官网快捷下拉：选中即在新标签页打开对应网址，随后复位回占位项 =====
const examSelect = document.getElementById("examSelect");
examSelect.addEventListener("change", () => {
    const url = examSelect.value;
    if (url) {
        window.open(url, "_blank", "noopener");
        examSelect.value = ""; // 复位回「🎓 考试官网」
    }
});

// ===== 搜索 =====
searchInput.addEventListener("input", (e) => {
    onSearchInput(e.target.value);
});

// ===== 全局快捷键 =====
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        tryCloseToolModal();
        closeAuth();
        closePwModal();
    }
});

// ===== 初始化 =====
App.tools = loadTools();
setNoteStatus("已保存到本地 ✓");
updateAuthUI();
renderCategories();
renderGrid();
initCloud(); // 异步：SDK 就绪后接管登录态与云同步
