// =========================================================
// map.js —— 高德地图：选点/搜索 → 写攻略 → 传照片
// =========================================================

import { App, escapeHtml, extractErrMsg } from "./store.js";

const mapSection = document.getElementById("mapSection");
const mapSearch = document.getElementById("mapSearch");
const mapStatus = document.getElementById("mapStatus");

const placeEditor = document.getElementById("placeEditor");
const placeName = document.getElementById("placeName");
const placeGuide = document.getElementById("placeGuide");
const placePhotoInput = document.getElementById("placePhotoInput");
const photoGrid = document.getElementById("photoGrid");
const placeError = document.getElementById("placeError");
const placeSaveBtn = document.getElementById("placeSaveBtn");
const placeDeleteBtn = document.getElementById("placeDeleteBtn");
const placeCloseBtn = document.getElementById("placeCloseBtn");
const placeChips = document.getElementById("placeChips");

let amapMap = null;
let mapLoading = false;
let mapReady = false;
let mapRetryUsed = false;

let places = [];            // 已保存的地点（云端数据）
let activePlace = null;     // 正在编辑的地点
let pendingFiles = [];      // 待上传的图片文件
let placeMarkers = [];      // 地图上的地点标记

export const amapConfigured =
    typeof AMAP_KEY === "string" && AMAP_KEY.trim().length > 10 &&
    typeof AMAP_SECURITY_CODE === "string" && AMAP_SECURITY_CODE.trim().length > 10;

function setMapStatus(text) {
    mapStatus.textContent = text;
}

export function isMapReady() {
    return mapReady;
}

function loadAmapScript() {
    return new Promise((resolve, reject) => {
        if (window.AMap && window.AMap.Map) return resolve();
        // 安全密钥必须在 SDK 加载前配置
        window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE.trim() };
        const s = document.createElement("script");
        s.src = "https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(AMAP_KEY.trim()) +
            "&plugin=AMap.PlaceSearch,AMap.AutoComplete,AMap.Geolocation,AMap.Scale,AMap.Geocoder";
        s.onload = () => {
            // 加载器是异步的：onload 后 AMap 可能还没挂载完成，轮询等它就绪（最多 10 秒）
            let waited = 0;
            const timer = setInterval(() => {
                if (window.AMap && window.AMap.Map) {
                    clearInterval(timer);
                    resolve();
                } else if (++waited > 100) {
                    clearInterval(timer);
                    reject(new Error("脚本加载失败"));
                }
            }, 100);
        };
        s.onerror = () => reject(new Error("脚本加载失败"));
        document.head.appendChild(s);
    });
}

async function initMap() {
    if (mapReady || mapLoading) return;
    mapLoading = true;

    setMapStatus("正在加载地图…");
    try {
        await loadAmapScript();

        amapMap = new AMap.Map("mapContainer", {
            zoom: 11,
            center: [116.397, 39.909], // 默认北京，可用搜索/定位移动
            viewMode: "2D",
        });

        amapMap.on("click", (e) => {
            startDraft(e.lnglat.getLng(), e.lnglat.getLat(), "");
        });

        amapMap.on("complete", () => {
            mapReady = true;
            mapLoading = false;
            setMapStatus("");
            loadPlaces();
        });

        // 增强组件失败不影响地图本体
        try {
            amapMap.addControl(new AMap.Scale());
            amapMap.addControl(new AMap.ToolBar({ position: "RB" }));
        } catch (e) { console.warn("地图工具条不可用", e); }

        try {
            // 搜索框：输入联想 + 选中后飞到该地点，并打开攻略编辑（草稿）
            const autoComplete = new AMap.AutoComplete({ input: "mapSearch" });
            autoComplete.on("select", (e) => {
                const poi = e.poi;
                if (!poi || !poi.location) {
                    setMapStatus("没找到该地点，换个关键词试试");
                    return;
                }
                amapMap.setZoomAndCenter(15, [poi.location.lng, poi.location.lat]);
                startDraft(poi.location.lng, poi.location.lat, poi.name || "");
            });
        } catch (e) { console.warn("搜索联想不可用", e); }

        // 兜底：15 秒仍未就绪才视为真正失败
        setTimeout(() => {
            if (!mapReady) {
                mapLoading = false;
                setMapStatus("地图加载失败：请检查 Key / 安全密钥 / 网络");
            }
        }, 15000);
    } catch (e) {
        mapLoading = false;
        // 首次失败自动重试一次（多为加载器异步就绪的时序问题）
        if (!mapRetryUsed) {
            mapRetryUsed = true;
            setTimeout(initMap, 1500);
            return;
        }
        setMapStatus("地图加载失败：请检查 Key 是否正确、网络是否可达 webapi.amap.com");
    }
}

// 地图区块进入视口时才开始加载
if (amapConfigured) {
    const mapObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (en.isIntersecting) {
                mapObserver.disconnect();
                initMap();
            }
        });
    }, { threshold: 0.1 });
    mapObserver.observe(mapSection);

    // 控制条上的地图图标：点击收起 / 展开地图板块
    const mapJumpBtn = document.getElementById("mapJump");
    if (mapJumpBtn) {
        mapJumpBtn.hidden = false;
        mapJumpBtn.addEventListener("click", () => {
            mapSection.hidden = !mapSection.hidden;
            mapJumpBtn.classList.toggle("active", !mapSection.hidden);
            mapJumpBtn.title = mapSection.hidden ? "展开地图" : "收起地图";
        });
    }
}

document.getElementById("mapLocate").addEventListener("click", () => {
    if (!mapReady) return;
    setMapStatus("正在获取定位…");
    const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000 });
    geo.getCurrentPosition((status, result) => {
        if (status === "complete") {
            amapMap.setZoomAndCenter(15, [result.position.lng, result.position.lat]);
            new AMap.Marker({ position: [result.position.lng, result.position.lat], title: "我的位置", map: amapMap });
            setMapStatus("已定位到你的位置");
        } else {
            setMapStatus("定位失败：请检查浏览器定位权限");
        }
    });
});

// =========================================================
// 地点攻略：数据与编辑
// =========================================================

function renderPhotoGrid() {
    photoGrid.innerHTML = "";
    activePlace.photos.forEach((url) => {
        const wrap = document.createElement("div");
        wrap.className = "photo-item";
        wrap.innerHTML = `<img src="${escapeHtml(url)}" alt=""><button class="photo-del" title="删除图片">✕</button>`;
        wrap.querySelector(".photo-del").addEventListener("click", () => {
            activePlace.removedPhotos.push(url);
            activePlace.photos = activePlace.photos.filter((u) => u !== url);
            renderPhotoGrid();
        });
        photoGrid.appendChild(wrap);
    });
    pendingFiles.forEach((f, i) => {
        const wrap = document.createElement("div");
        wrap.className = "photo-item";
        wrap.innerHTML = `<img src="${URL.createObjectURL(f)}" alt=""><button class="photo-del" title="移除">✕</button>`;
        wrap.querySelector(".photo-del").addEventListener("click", () => {
            pendingFiles.splice(i, 1);
            renderPhotoGrid();
        });
        photoGrid.appendChild(wrap);
    });
}

function openPlaceEditor(p) {
    activePlace = {
        id: p.id || null,
        isNew: !p.id,
        lng: p.lng,
        lat: p.lat,
        guide: p.guide || "",
        photos: [...(p.photos || [])],
        removedPhotos: [],
        name: p.name || "",
    };
    pendingFiles = [];
    placeEditor.hidden = false;
    placeName.value = activePlace.name;
    placeGuide.value = activePlace.guide;
    placeError.textContent = "";
    placeError.classList.remove("ok");
    placeDeleteBtn.hidden = activePlace.isNew;
    renderPhotoGrid();
    renderPlaceChips();
    placeName.focus();
}

function closePlaceEditor() {
    placeEditor.hidden = true;
    activePlace = null;
    pendingFiles = [];
}

function startDraft(lng, lat, presetName) {
    if (!App.currentUser) {
        setMapStatus("登录后才能记录地点攻略哦");
        return;
    }
    openPlaceEditor({ lng, lat, name: presetName });

    // 没有名字时用逆地理编码补一个地址
    if (!presetName && window.AMap && AMap.Geocoder) {
        const geo = new AMap.Geocoder();
        geo.getAddress([lng, lat], (status, result) => {
            if (status === "complete" && result.regeocode && activePlace && !placeName.value) {
                const addr = result.regeocode.formattedAddress || "";
                placeName.value = addr.replace(/^中国/, "").slice(0, 30);
            }
        });
    }
}

function updatePlacesAfterSave(saved) {
    const idx = places.findIndex((p) => p.id === saved.id);
    if (idx >= 0) places[idx] = saved;
    else places.push(saved);
    renderMarkers();
    renderPlaceChips();
}

function renderMarkers() {
    if (!amapMap) return;
    placeMarkers.forEach((m) => m.setMap(null));
    placeMarkers = [];
    places.forEach((p) => {
        const m = new AMap.Marker({
            position: [p.lng, p.lat],
            title: p.name,
            map: amapMap,
            label: { content: escapeHtml(p.name), direction: "top" },
        });
        m.on("click", () => {
            amapMap.setZoomAndCenter(15, [p.lng, p.lat]);
            openPlaceEditor(p);
        });
        placeMarkers.push(m);
    });
}

function renderPlaceChips() {
    placeChips.innerHTML = "";
    if (places.length === 0) return;
    places.forEach((p) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "place-chip";
        chip.textContent = "📍 " + p.name;
        chip.addEventListener("click", () => {
            amapMap.setZoomAndCenter(14, [p.lng, p.lat]);
            openPlaceEditor(p);
        });
        placeChips.appendChild(chip);
    });
}

export async function loadPlaces() {
    if (!App.currentUser || !App.supabaseClient || !mapReady) return;
    const { data, error } = await App.supabaseClient
        .from("places")
        .select("*")
        .order("created_at", { ascending: true });
    if (error) {
        setMapStatus("⚠ " + extractErrMsg(error));
        return;
    }
    places = data || [];
    renderMarkers();
    renderPlaceChips();
}

export function clearPlacesUI() {
    places = [];
    activePlace = null;
    pendingFiles = [];
    if (amapMap && mapReady) {
        placeMarkers.forEach((m) => m.setMap(null));
        placeMarkers = [];
        renderPlaceChips();
        closePlaceEditor();
    }
}

placePhotoInput.addEventListener("change", () => {
    const files = [...placePhotoInput.files].filter((f) => f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024);
    if (files.length === 0) return;
    pendingFiles = pendingFiles.concat(files);
    if (!activePlace) {
        // 未选点前先按地图中心建草稿
        const c = amapMap ? amapMap.getCenter() : null;
        startDraft(c ? c.getLng() : 116.397, c ? c.getLat() : 39.909, "");
    }
    renderPhotoGrid();
    placePhotoInput.value = "";
});

placeCloseBtn.addEventListener("click", closePlaceEditor);

placeSaveBtn.addEventListener("click", async () => {
    if (!activePlace) return;
    if (!App.currentUser) {
        placeError.textContent = "请先登录，攻略和图片才会保存到你的账号";
        return;
    }
    const name = placeName.value.trim();
    if (!name) {
        placeError.textContent = "请填写地点名称";
        return;
    }
    placeSaveBtn.disabled = true;
    placeError.textContent = "";
    try {
        let pid = activePlace.id;
        if (activePlace.isNew) {
            const { data, error } = await App.supabaseClient
                .from("places")
                .insert({ user_id: App.currentUser.id, name, lng: activePlace.lng, lat: activePlace.lat, guide: placeGuide.value, photos: [] })
                .select()
                .single();
            if (error) throw error;
            pid = data.id;
            activePlace.id = pid;
            activePlace.isNew = false;
        } else {
            const { error } = await App.supabaseClient
                .from("places")
                .update({ name, guide: placeGuide.value })
                .eq("id", pid);
            if (error) throw error;
        }

        // 上传新图片到 Storage
        for (const f of pendingFiles) {
            const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
            const path = `${App.currentUser.id}/${pid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error: upErr } = await App.supabaseClient.storage.from("place-photos").upload(path, f);
            if (upErr) throw upErr;
            const { data: pub } = App.supabaseClient.storage.from("place-photos").getPublicUrl(path);
            activePlace.photos.push(pub.publicUrl);
        }
        pendingFiles = [];

        // 删除被移除的图片文件
        for (const url of activePlace.removedPhotos) {
            const path = decodeURIComponent(url.split("/place-photos/")[1] || "");
            if (path) await App.supabaseClient.storage.from("place-photos").remove([path]);
        }
        activePlace.removedPhotos = [];

        const { error: phErr } = await App.supabaseClient
            .from("places")
            .update({ photos: activePlace.photos })
            .eq("id", pid);
        if (phErr) throw phErr;

        updatePlacesAfterSave({ id: pid, user_id: App.currentUser.id, name, lng: activePlace.lng, lat: activePlace.lat, guide: placeGuide.value, photos: activePlace.photos });
        renderPhotoGrid();
        placeError.classList.add("ok");
        placeError.textContent = "已保存 ✓";
    } catch (e) {
        placeError.textContent = "保存失败：" + extractErrMsg(e);
    } finally {
        placeSaveBtn.disabled = false;
    }
});

placeDeleteBtn.addEventListener("click", async () => {
    if (!activePlace || !confirm(`确定删除「${activePlace.name}」吗？其攻略和图片也会删除。`)) return;
    placeDeleteBtn.disabled = true;
    try {
        for (const url of activePlace.photos) {
            const path = decodeURIComponent(url.split("/place-photos/")[1] || "");
            if (path) await App.supabaseClient.storage.from("place-photos").remove([path]);
        }
        const { error } = await App.supabaseClient.from("places").delete().eq("id", activePlace.id);
        if (error) throw error;
        places = places.filter((p) => p.id !== activePlace.id);
        renderMarkers();
        renderPlaceChips();
        closePlaceEditor();
    } catch (e) {
        placeError.textContent = "删除失败：" + extractErrMsg(e);
    } finally {
        placeDeleteBtn.disabled = false;
    }
});
