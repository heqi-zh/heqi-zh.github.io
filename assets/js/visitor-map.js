(() => {
  "use strict";

  const root = document.getElementById("visitor-map-panel");
  if (!root) return;

  const summary = root.querySelector(".visitor-map__summary");
  const markers = root.querySelector(".visitor-map__markers");
  const namespace = "http://www.w3.org/2000/svg";

  const canvas = root.querySelector(".visitor-map__canvas");
  const ocean = root.querySelector(".visitor-map__ocean");
  const land = root.querySelector(".visitor-map__land");
  const projection = d3.geoOrthographic()
    .translate([320, 230]).scale(210).rotate([-110, -25]).clipAngle(90);
  const path = d3.geoPath(projection);
  let locations = [];
  let countries = [];
  let drag = null;
  let frame = null;

  // Opt-in status view for troubleshooting without browser developer tools.
  if (new URLSearchParams(location.search).get("visitor-debug") === "1") {
    const diagnostics = document.createElement("p");
    diagnostics.className = "visitor-map__diagnostics";
    diagnostics.textContent = "正在检查访客统计…";
    root.insertBefore(diagnostics, canvas);
    setInterval(() => {
      const tracking = {loading: "正在上报", loaded: "官方采集脚本已加载，到账请看后台",
        unavailable: "采集脚本未能加载", skipped: "按账号设置忽略本次访问", preview: "本地预览，不计数"};
      const state = {loading: "正在读取", ready: "读取成功", empty: "暂无记录", pending: "等待配置地域数据同步",
        unavailable: "读取失败"};
      const updated = root.dataset.updatedAt
        ? new Date(root.dataset.updatedAt).toLocaleTimeString("zh-CN") : "尚未完成";
      diagnostics.textContent = [
        "访客统计诊断",
        `访问上报：${tracking[root.dataset.trackingState] || "尚未开始"}`,
        `访客数据：${state[root.dataset.state] || "正在加载"}`,
        `最近读取：${updated}`,
        `服务返回：${locations.map(point => point.label).join("；") || "暂无地点数据"}`
      ].join("\n");
    }, 1000);
  }

  function render() {
    frame = null;
    ocean.setAttribute("d", path({type: "Sphere"}));
    for (const country of countries) {
      country.element.setAttribute("d", path(country.feature) || "");
    }
    drawLocations(locations);
  }

  function scheduleRender() {
    if (frame === null) frame = requestAnimationFrame(render);
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY,
      rotation: projection.rotate()};
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const sensitivity = 0.3 * 640 / canvas.getBoundingClientRect().width;
    projection.rotate([
      drag.rotation[0] + (event.clientX - drag.x) * sensitivity,
      Math.max(-85, Math.min(85, drag.rotation[1] - (event.clientY - drag.y) * sensitivity))
    ]);
    scheduleRender();
  });
  const finishDrag = () => {
    drag = null;
    canvas.classList.remove("is-dragging");
  };
  canvas.addEventListener("lostpointercapture", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("keydown", (event) => {
    const movement = {ArrowLeft: [-8, 0], ArrowRight: [8, 0],
      ArrowUp: [0, -8], ArrowDown: [0, 8]}[event.key];
    if (!movement) return;
    event.preventDefault();
    const rotation = projection.rotate();
    projection.rotate([rotation[0] + movement[0],
      Math.max(-85, Math.min(85, rotation[1] + movement[1]))]);
    scheduleRender();
  });

  async function loadMap() {
    try {
      const response = await fetch("assets/data/visitor-map-countries.json");
      if (!response.ok) throw new Error("Map could not be loaded");
      const world = await response.json();
      countries = world.features.map((feature) => {
        // D3 uses clockwise exterior rings for polygons smaller than a hemisphere.
        if (d3.geoArea(feature) > 2 * Math.PI) {
          const polygons = feature.geometry.type === "Polygon"
            ? [feature.geometry.coordinates] : feature.geometry.coordinates;
          for (const polygon of polygons) for (const ring of polygon) ring.reverse();
        }
        const element = document.createElementNS(namespace, "path");
        land.appendChild(element);
        return {feature, element};
      });
      root.dataset.mapState = "ready";
      render();
    } catch (error) {
      summary.textContent = "Map is temporarily unavailable.";
      summary.hidden = false;
      root.dataset.mapState = "unavailable";
    }
  }

  function drawLocations(points) {
    markers.replaceChildren();
    const center = projection.invert([320, 230]);
    for (const location of points) {
      const coordinates = [location.longitude, location.latitude];
      if (d3.geoDistance(center, coordinates) >= Math.PI / 2) continue;
      const [x, y] = projection(coordinates);
      const group = document.createElementNS(namespace, "g");
      group.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);

      const dot = document.createElementNS(namespace, "circle");
      dot.setAttribute("class", "visitor-map__dot");
      dot.setAttribute("r", "2");
      dot.setAttribute("tabindex", "0");
      dot.setAttribute("aria-label", location.label);
      const title = document.createElementNS(namespace, "title");
      title.textContent = location.label;
      dot.appendChild(title);
      group.appendChild(dot);
      markers.appendChild(group);
    }
  }

  function recordVisit() {
    if (location.origin !== new URL(root.dataset.siteUrl).origin) {
      root.dataset.trackingState = "preview";
      return Promise.resolve();
    }
    root.dataset.trackingState = "loading";
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.setAttribute("data-goatcounter", root.dataset.goatcounterEndpoint);
      script.setAttribute("data-goatcounter-settings", '{"no_events":true}');
      // This is an unmodified copy of the official tracker. Hosting it with the
      // page avoids a second script CDN; visits still go directly to GoatCounter.
      script.src = "assets/js/goatcounter-count.js";
      script.async = true;
      const timer = setTimeout(() => {
        root.dataset.trackingState = "unavailable";
        resolve();
      }, 12000);
      script.onload = () => {
        clearTimeout(timer);
        const ignored = window.goatcounter && window.goatcounter.filter();
        root.dataset.trackingState = ignored ? "skipped" : "loaded";
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        root.dataset.trackingState = "unavailable";
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  let refreshing = false;

  async function refreshVisitors() {
    if (refreshing) return;
    refreshing = true;
    try {
      const response = await fetch("assets/data/visitor-locations.json", {cache: "no-store"});
      if (!response.ok) throw new Error("Visitor snapshot could not be loaded");
      const snapshot = await response.json();
      if (snapshot.source !== "goatcounter") throw new Error("Unexpected visitor source");
      locations = snapshot.locations.filter(point =>
        Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
        Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180 &&
        typeof point.label === "string");
      drawLocations(locations);
      root.dataset.state = snapshot.status === "pending" ? "pending"
        : locations.length ? "ready" : "empty";
      root.dataset.updatedAt = snapshot.updatedAt || "";
      summary.textContent = "";
      summary.hidden = true;
    } catch (error) {
      summary.textContent = "Visitor data is temporarily unavailable.";
      summary.hidden = false;
      root.dataset.state = "unavailable";
    } finally {
      refreshing = false;
    }
  }

  async function startVisitors() {
    recordVisit();
    await refreshVisitors();
    // Collection is live. The public country-level snapshot is synced hourly.
    setInterval(() => {
      if (!document.hidden) refreshVisitors();
    }, 300000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshVisitors();
    });
  }

  loadMap();
  startVisitors();
})();
