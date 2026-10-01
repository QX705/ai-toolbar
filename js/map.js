// =========================================================
// study.js（原 map.js 精简）—— 学习通内嵌视图切换
// 地图模块已移除：删除地图/地点/攻略/照片相关全部代码
// =========================================================

const studyBtn = document.getElementById("studyJump");
const studySection = document.getElementById("studySection");

function showStudy(show) {
    if (!studySection) return;
    studySection.hidden = !show;
    document.getElementById("toolSections").hidden = show;
    const es = document.getElementById("emptyState");
    if (es) es.hidden = show;
    // 学习通视图下隐藏笔记视图
    const ns = document.getElementById("notesSection");
    if (ns) ns.hidden = true;
    const nt = document.getElementById("notesToggle");
    if (nt) nt.classList.remove("active");
    if (studyBtn) {
        studyBtn.classList.toggle("active", show);
        studyBtn.title = show ? "返回工具列表" : "打开学习通";
    }
}

if (studyBtn) {
    studyBtn.hidden = false;
    showStudy(false); // 默认显示工具视图
    studyBtn.addEventListener("click", () => {
        const now = Date.now();
        // window 级防抖：即使模块被加载两个实例，也只触发一次切换
        if (window.__lastStudyToggle && now - window.__lastStudyToggle < 500) return;
        window.__lastStudyToggle = now;
        showStudy(studySection.hidden);
    });
}
