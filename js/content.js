// =========================================================
// content.js —— 站点内容层：所有文案 / 数据 / 素材配置集中在这里
// 改文案、加工具、换壁纸、调桌宠台词，只动这个文件，不碰逻辑代码。
// 逻辑模块（store/desktop/auth/notes…）从这里 import。
// =========================================================

// ===== 分类与应用图标 =====
export const CATEGORIES = ["AI工具", "编程开发", "图标制作", "学习插件", "游戏官网", "游戏插件", "考试网", "其他"];

// ===== 默认工具表（未登录时的预置列表） =====
export const DEFAULT_TOOLS = [
    { id: 1,  name: "豆包",                 url: "https://www.doubao.com",                         category: "AI工具" },
    { id: 2,  name: "deepseek",             url: "https://chat.deepseek.com",                      category: "AI工具" },
    { id: 3,  name: "即梦",                 url: "https://jimeng.jianying.com",                    category: "AI工具" },
    { id: 4,  name: "智谱",                 url: "https://zcode.z.ai/cn",                          category: "AI工具" },
    { id: 5,  name: "Hitem 3D",             url: "https://www.hitem3d.com/",                       category: "AI工具" },
    { id: 6,  name: "力扣",                 url: "https://leetcode.cn",                            category: "编程开发" },
    { id: 7,  name: "牛客网",               url: "https://www.nowcoder.com",                       category: "编程开发" },
    { id: 8,  name: "CSDN",                 url: "https://www.csdn.net",                           category: "编程开发" },
    { id: 9,  name: "vscode",               url: "https://code.visualstudio.com",                  category: "编程开发" },
    { id: 10, name: "GitHub",               url: "https://github.com",                             category: "编程开发" },
    { id: 11, name: "Qt center",            url: "https://download.qt.io",                         category: "编程开发" },
    { id: 12, name: "嘉立创EDA客户中心",    url: "https://member.jlc.com",                         category: "编程开发" },
    { id: 13, name: "ICO图标生成",          url: "https://www.icoa.cc",                            category: "图标制作" },
    { id: 14, name: "阿里巴巴矢量图",       url: "https://www.iconfont.cn",                        category: "图标制作" },
    { id: 15, name: "软仓",                 url: "https://ruancang.net",                           category: "学习插件" },
    { id: 16, name: "凹凸工坊",             url: "https://www.autohanding.com",                    category: "学习插件" },
    { id: 17, name: "iLovePDF",             url: "https://www.ilovepdf.com",                       category: "学习插件" },
    { id: 18, name: "TinyPNG",              url: "https://tinypng.com",                            category: "学习插件" },
    { id: 19, name: "可画",                 url: "https://www.canva.cn",                           category: "学习插件" },
    { id: 20, name: "稿定",                 url: "http://www.gaoding.com",                         category: "学习插件" },
    { id: 21, name: "人类一败涂地",         url: "https://gaming.lenovo.com/human-fall-flat",      category: "游戏官网" },
    { id: 22, name: "科雷娱乐",             url: "https://accounts.klei.com",                      category: "游戏官网" },
    { id: 23, name: "Steam",                url: "https://store.steampowered.com",                 category: "游戏官网" },
    { id: 24, name: "BongoCat_Mod",         url: "https://xv40.lanzouu.com/b0fpy9v9e",             category: "游戏插件" },
    { id: 25, name: "悟空神辅",             url: "https://pan.lanzoue.com/ikkfa49vajfe",           category: "游戏插件" },
    { id: 26, name: "湖工大科院教务平台",   url: "http://kyjxxt.hut.edu.cn/jsxsd/",                category: "学校官网" },
    { id: 27, name: "金数据",               url: "https://jinshuju.net",                           category: "其他" },
    { id: 28, name: "Supabase",             url: "https://supabase.com",                           category: "其他" },
    { id: 29, name: "全民简历",             url: "https://www.qmjianli.com",                       category: "其他" },
    { id: 30, name: "Maker World",          url: "https://makerworld.com.cn",                      category: "其他" },
    { id: 31, name: "flysheep资源避难所",   url: "https://www.flysheep6.com",                      category: "其他" },
];

// ===== 桌面模式：搜索引擎 =====
export const ENGINES = [
    { id: "baidu",  name: "百度",   url: "https://www.baidu.com/s?wd=",      badge: "百",  color: "#2932e1" },
    { id: "bing",   name: "必应",   url: "https://www.bing.com/search?q=",   badge: "B",   color: "#008373" },
    { id: "google", name: "Google", url: "https://www.google.com/search?q=", badge: "G",   color: "#4285f4" },
    { id: "quark",  name: "夸克",   url: "https://quark.sm.cn/s?q=",         badge: "夸",  color: "#7c4dff" },
    { id: "so360",  name: "360",    url: "https://www.so.com/s?q=",          badge: "360", color: "#22a62b" },
];

// ===== 桌面模式：壁纸预设 =====
export const WALLPAPERS = [
    { id: "night",  name: "暗夜", css: "linear-gradient(160deg,#141528 0%,#1e1b3a 45%,#0d0d1c 100%)" },
    { id: "violet", name: "星紫", css: "linear-gradient(160deg,#1b1035 0%,#3b1f66 50%,#0f0a1f 100%)" },
    { id: "forest", name: "墨绿", css: "linear-gradient(160deg,#0c1f1a 0%,#14352b 50%,#081310 100%)" },
    { id: "mono",   name: "石墨", css: "linear-gradient(160deg,#17181c 0%,#24262c 50%,#101114 100%)" },
];

// ===== 桌面模式：分类 Dock 图标 =====
export const CAT_ICONS = {
    AI工具: "🤖", 编程开发: "💻", 图标制作: "🎨", 学习插件: "📚",
    游戏官网: "🎮", 游戏插件: "🕹️", 考试网: "📝", 学校官网: "🏫", 其他: "📦",
};

// ===== 笔记：新用户首篇指南 =====
export const SEED_NOTE = {
    title: "📝 使用指南",
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
        "> 工具条上的 📎 可以插入图片、PDF 等附件（需登录）。",
    ].join("\n"),
};

// ===== 笔记：新用户首篇指南 =====
export const LOGIN_PET_TIPS = [
    "嗨～我是小柚，看好你登录哦",
    "右边归你，左边归我",
    "登录后数据全设备同步！",
    "喵？密码忘了吗，摸摸头",
    "悄悄说：↺ 在 Dock 里",
    "欢迎回来呀～",
];

// ===== 登录页小柚：分层区域（对应 assets/pet.webp，658x658） =====
// origin = 各部位摆动的关节点
export const PET_PART_BOXES = {
    earL: { x: 118, y: 14, w: 180, h: 165, origin: "55% 92%" },
    earR: { x: 360, y: 14, w: 180, h: 165, origin: "45% 92%" },
    pawL: { x: 86, y: 412, w: 222, h: 185, origin: "50% 96%" },
    pawR: { x: 350, y: 412, w: 222, h: 185, origin: "50% 96%" },
};
