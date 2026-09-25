// =========================================================
// tools.js —— 工具卡片：渲染、分类筛选、增删改查
// =========================================================

import { App, CATEGORIES, DEFAULT_TOOLS, escapeHtml, avatarColor, domainOf, normUrlKey, normalizeUrl, iconSources, saveTools } from "./store.js?v=47";

const toolSections = document.getElementById("toolSections");
const categorySelect = document.getElementById("categorySelect");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");

function visibleTools() {
    return App.tools.filter((t) => {
        const matchCat = App.activeCategory === "全部" || t.category === App.activeCategory;
        const kw = App.keyword.trim().toLowerCase();
        const matchKw =
            !kw ||
            t.name.toLowerCase().includes(kw) ||
            t.url.toLowerCase().includes(kw);
        return matchCat && matchKw;
    });
}

export function renderCategories() {
    categorySelect.innerHTML = "";
    ["全部", ...CATEGORIES].forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        opt.selected = cat === App.activeCategory;
        categorySelect.appendChild(opt);
    });
}

categorySelect.addEventListener("change", () => {
    App.activeCategory = categorySelect.value;
    renderGrid();
});

// 搜索框在 main.js 绑定 input 事件后调用这里
export function onSearchInput(value) {
    App.keyword = value;
    renderGrid();
}

function buildCard(tool) {
    const card = document.createElement("div");
    card.className = "tool-card";
    card.title = tool.url;

    card.addEventListener("click", () => {
        window.open(tool.url, "_blank", "noopener");
    });

    const initial = [...tool.name][0].toUpperCase();

    card.innerHTML = `
        <div class="tool-actions">
            <button class="act-btn edit" title="编辑">✏️</button>
            <button class="act-btn danger" title="删除">🗑️</button>
        </div>
        <div class="tool-head">
            <div class="tool-avatar" style="background:${avatarColor(tool.name)}"><span class="avatar-letter">${initial}</span><img class="tool-icon" alt="" referrerpolicy="no-referrer"></div>
            <div style="min-width:0">
                <div class="tool-name">${escapeHtml(tool.name)}</div>
                <div class="tool-domain">${escapeHtml(domainOf(tool.url))}</div>
            </div>
        </div>
        <span class="tool-cat">${escapeHtml(tool.category)}</span>
    `;

    // 网站图标：逐个候选源尝试（8 秒超时强制换源），全部失败则保留字母头像
    const iconImg = card.querySelector(".tool-icon");
    const sources = iconSources(tool.url);
    let sourceIdx = 0;
    let iconTimer = null;
    const tryNextSource = () => {
        clearTimeout(iconTimer);
        sourceIdx++;
        if (sourceIdx < sources.length) {
            iconImg.src = sources[sourceIdx];
            iconTimer = setTimeout(tryNextSource, 8000);
        } else {
            iconImg.remove();
        }
    };
    iconImg.addEventListener("load", () => { clearTimeout(iconTimer); iconImg.classList.add("loaded"); });
    iconImg.addEventListener("error", tryNextSource);
    if (sources.length > 0) {
        iconImg.src = sources[0];
        iconTimer = setTimeout(tryNextSource, 8000);
    } else iconImg.remove();

    card.querySelector(".edit").addEventListener("click", (e) => {
        e.stopPropagation();
        import("./modal.js").then((m) => m.openToolModal(tool));
    });
    card.querySelector(".danger").addEventListener("click", (e) => {
        e.stopPropagation();
        removeTool(tool);
    });

    return card;
}

export function renderGrid() {
    const list = visibleTools();
    toolSections.innerHTML = "";
    emptyState.hidden = list.length > 0;

    // 按分类分组
    const groups = new Map();
    list.forEach((t) => {
        const cat = t.category || "其他";
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(t);
    });

    const ordered = [
        ...CATEGORIES.filter((c) => groups.has(c)),
        ...[...groups.keys()].filter((c) => !CATEGORIES.includes(c)),
    ];

    ordered.forEach((cat) => {
        const section = document.createElement("section");
        section.className = "tool-section";

        const title = document.createElement("h2");
        title.className = "section-title";
        title.textContent = cat;
        section.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "tool-grid";
        groups.get(cat).forEach((tool) => grid.appendChild(buildCard(tool)));
        section.appendChild(grid);

        toolSections.appendChild(section);
    });
}

// ===== 工具增删改（登录时同步云端） =====
export async function addTool(name, url, category) {
    if (App.currentUser && App.supabaseClient) {
        const { data, error } = await App.supabaseClient
            .from("tools")
            .insert({ user_id: App.currentUser.id, name, url, category, sort: App.tools.length })
            .select()
            .single();
        if (error) throw error;
        App.tools.push(data);
    } else {
        App.tools.push({ id: Date.now(), name, url, category });
    }
    saveTools();
}

export async function updateTool(tool, name, url, category) {
    if (App.currentUser && App.supabaseClient) {
        const { error } = await App.supabaseClient
            .from("tools")
            .update({ name, url, category })
            .eq("id", tool.id);
        if (error) throw error;
    }
    tool.name = name;
    tool.url = url;
    tool.category = category;
    saveTools();
}

export async function deleteTool(tool) {
    if (App.currentUser && App.supabaseClient) {
        const { error } = await App.supabaseClient.from("tools").delete().eq("id", tool.id);
        if (error) throw error;
    }
    App.tools = App.tools.filter((t) => t.id !== tool.id);
    saveTools();
}

export function removeTool(tool) {
    if (!confirm(`确定删除「${tool.name}」吗？`)) return;
    deleteTool(tool)
        .then(renderGrid)
        .catch((e) => alert("删除失败：" + (e.message || e)));
}

// ===== 恢复默认工具列表 =====
document.getElementById("resetBtn").addEventListener("click", async () => {
    if (!confirm("确定恢复默认工具列表吗？当前列表（含你自己添加的）会被覆盖。")) return;

    if (App.currentUser && App.supabaseClient) {
        // 登录中：同步删掉云端全部工具，再上传默认列表
        try {
            const ids = App.tools.map((t) => t.id);
            if (ids.length > 0) {
                const { error } = await App.supabaseClient.from("tools").delete().in("id", ids);
                if (error) throw error;
            }
            const rows = DEFAULT_TOOLS.map((t, i) => ({ user_id: App.currentUser.id, name: t.name, url: t.url, category: t.category, sort: i }));
            const { data, error } = await App.supabaseClient.from("tools").insert(rows).select();
            if (error) throw error;
            App.tools = data;
        } catch (e) {
            alert("恢复失败：" + (e.message || e));
            return;
        }
    } else {
        App.tools = [...DEFAULT_TOOLS];
    }

    saveTools();
    App.activeCategory = "全部";
    renderCategories();
    renderGrid();
});
