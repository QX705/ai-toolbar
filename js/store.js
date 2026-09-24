// =========================================================
// store.js —— 全局状态 + 常量 + 通用工具函数
// 所有模块共享的状态都放在 App 对象里
// =========================================================

export const STORAGE_KEY = "ai-toolbar-tools";
export const NOTE_KEY = "ai-toolbar-note";

export const CATEGORIES = ["AI工具", "编程开发", "图标制作", "学习插件", "游戏官网", "其他"];

// 预置工具（未登录时的默认列表；登录后代码里新增的工具会自动合并进云端账号）
export const DEFAULT_TOOLS = [
    { id: 1,  name: "豆包",                 url: "https://www.doubao.com",                        category: "AI工具" },
    { id: 2,  name: "deepseek",             url: "https://chat.deepseek.com",                     category: "AI工具" },
    { id: 3,  name: "即梦",                 url: "https://jimeng.jianying.com",                    category: "AI工具" },
    { id: 4,  name: "智谱",                 url: "https://zcode.z.ai/cn",                          category: "AI工具" },
    { id: 5,  name: "力扣",                 url: "https://leetcode.cn",                            category: "编程开发" },
    { id: 6,  name: "牛客网",               url: "https://www.nowcoder.com",                       category: "编程开发" },
    { id: 7,  name: "CSDN",                 url: "https://www.csdn.net",                           category: "编程开发" },
    { id: 8,  name: "GitHub",               url: "https://github.com",                             category: "编程开发" },
    { id: 9,  name: "Qt center",            url: "https://download.qt.io",                         category: "编程开发" },
    { id: 10, name: "嘉立创EDA客户中心",     url: "https://member.jlc.com",                          category: "编程开发" },
    { id: 11, name: "ICO图标生成",          url: "https://www.icoa.cc",                             category: "图标制作" },
    { id: 12, name: "阿里巴巴矢量图",       url: "https://www.iconfont.cn",                         category: "图标制作" },
    { id: 13, name: "软仓",                 url: "https://ruancang.net",                            category: "学习插件" },
    { id: 14, name: "凹凸工坊",             url: "https://www.autohanding.com",                     category: "学习插件" },
    { id: 15, name: "iLovePDF",             url: "https://www.ilovepdf.com",                        category: "学习插件" },
    { id: 16, name: "TinyPNG",              url: "https://tinypng.com",                             category: "学习插件" },
    { id: 17, name: "人类一败涂地",         url: "https://gaming.lenovo.com/human-fall-flat",        category: "游戏官网" },
    { id: 18, name: "科雷",                 url: "https://accounts.klei.com",                        category: "游戏官网" },
    { id: 19, name: "BongoCat_Mod",         url: "https://xv40.lanzouu.com/b0fpy9v9e",               category: "游戏官网" },
    { id: 20, name: "Steam",                url: "https://store.steampowered.com",                   category: "游戏官网" },
    { id: 21, name: "金数据",               url: "https://jinshuju.net",                             category: "其他" },
    { id: 22, name: "Supabase",             url: "https://supabase.com",                             category: "其他" },
    { id: 23, name: "全民简历",             url: "https://www.qmjianli.com",                         category: "其他" },
    { id: 24, name: "Maker World",          url: "https://makerworld.com.cn",                        category: "其他" },
];

// 全局共享状态
export const App = {
    tools: [],
    activeCategory: "全部",
    keyword: "",
    editingId: null,
    currentUser: null,      // Supabase 登录用户
    supabaseClient: null,   // SDK 就绪后赋值
    cloudReady: false,
    localBackup: null,      // 登录前的本地数据快照
    syncing: false,
    syncFailCount: 0,
    places: [],             // 已保存的地点（云端）
};

// ===== 工具函数 =====

// 根据名称生成稳定的头像底色
const AVATAR_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

export function avatarColor(name) {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function domainOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

export function normUrlKey(url) {
    return url.replace(/\/+$/, "").toLowerCase();
}

// 补全协议并校验网址，非法时返回 null
export function normalizeUrl(input) {
    let s = input.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    try {
        const u = new URL(s);
        if (!u.hostname.includes(".")) return null;
        return u.href;
    } catch {
        return null;
    }
}

export function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// 把 Supabase 的报错翻译成中文
export function extractErrMsg(e) {
    const raw = (e && (e.message || e.error_description || e.msg)) || String(e);
    const map = [
        ["Invalid login credentials", "邮箱或密码错误"],
        ["Email not confirmed", "请先到邮箱点击确认链接，再回来登录"],
        ["User already registered", "该邮箱已被注册，请直接登录"],
        ["at least 6 characters", "密码至少 6 位"],
        ["different from the old password", "新密码不能与旧密码相同"],
        ["rate limit", "操作太频繁，请稍后再试"],
        ["Failed to fetch", "无法连接云端服务，请检查网络"],
        ["Invalid API key", "云端密钥配置错误（请检查 config.js 中的 anon key）"],
        ["does not exist", "数据表还没创建：请在 Supabase 运行一次 supabase-setup.sql"],
        ["Could not find the table", "数据表还没创建：请在 Supabase 运行一次 supabase-setup.sql"],
        ["schema cache", "数据表还没创建：请在 Supabase 运行一次 supabase-setup.sql"],
        ["row-level security", "权限不足：请确认已在 Supabase 运行 supabase-setup.sql"],
        ["validated against", "邮箱格式不正确"],
    ];
    for (const [k, v] of map) if (raw && raw.includes(k)) return v;
    return raw;
}

// 网站图标候选源：优先站点自身 favicon.ico，失败依次换备用源
export function iconSources(url) {
    let origin = "";
    let host = "";
    try {
        const u = new URL(url);
        origin = u.origin;
        host = u.hostname;
    } catch {
        return [];
    }
    return [
        origin + "/favicon.ico",
        "https://favicon.im/" + host + "?larger=true",
        "https://api.iowen.cn/favicon/" + host + ".png",
    ];
}

// ===== 本地持久化 =====
export function loadTools() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        // 数据损坏时回退到默认
    }
    return [...DEFAULT_TOOLS];
}

export function saveTools() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(App.tools));
}

export function readNoteLocal() {
    return localStorage.getItem(NOTE_KEY) || "";
}

export function writeNoteLocal(text) {
    localStorage.setItem(NOTE_KEY, text);
}
