// =========================================================
// main.js —— 入口：初始化各模块、全局搜索、恢复默认、快捷键
// 功能代码分模块：
//   store.js  全局状态/常量/工具函数
//   tools.js  工具卡片（渲染/增删改查/分类）
//   modal.js  添加/编辑工具弹窗
//   notes.js  笔记
//   auth.js   登录/注册/修改密码
//   cloud.js  Supabase 云同步与自愈
//   map.js    地图 + 地点攻略 + 照片
// =========================================================

import { App, loadTools } from "./store.js";
import { renderCategories, renderGrid, onSearchInput } from "./tools.js";
import { setNoteStatus } from "./notes.js";
import { initCloud } from "./cloud.js";
import { updateAuthUI, closeAuth, closePwModal } from "./auth.js";
import { tryCloseToolModal } from "./modal.js";
import { amapConfigured } from "./map.js";
import "./notes.js";
import "./auth.js";
import "./modal.js";
import "./map.js";

const searchInput = document.getElementById("searchInput");

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
