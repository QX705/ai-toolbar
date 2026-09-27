// =========================================================
// Supabase 云端配置
// 获取方法：
//   1. 打开 https://supabase.com/dashboard 进入你的项目
//   2. 左侧 Settings（齿轮）→ API
//   3. 复制 "Project URL" 填到下面 SUPABASE_URL
//   4. 复制 "anon public" 密钥（一长串 eyJ... 开头）填到 SUPABASE_ANON_KEY
//
// 两个值都填好后，页面顶栏才会出现「登录 / 注册」按钮。
// 留空 = 纯本地模式（现状），不影响网站其他功能。
// anon key 是公开密钥，放在前端是安全的（数据受 RLS 保护）。
// =========================================================

const SUPABASE_URL = "https://saoxclysufugrqutaqny.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_m1BddNDAzcy9gBVIGA8C-Q_f_aTAw2X";

// ===== 高德地图（可选功能）=====
// 获取方法：
//   1. 打开 https://lbs.amap.com 注册（手机号即可）并进入控制台
//   2. 应用管理 → 创建新应用 → 添加 Key
//   3. 服务平台一定要选「Web端(JS API)」
//   4. 创建后得到 Key 和配对的「安全密钥 jscode」，分别填到下面
// 都填好后，顶栏会出现「地图」按钮；留空则不显示该功能。
const AMAP_KEY = "f3273bf8b8c868d7981f63294b311ade";
const AMAP_SECURITY_CODE = "438cb157a3e7d2f70692a2be37527584";
