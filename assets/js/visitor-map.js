(() => {
  "use strict";

  const root = document.getElementById("visitor-map-panel");
  if (!root) return;

  const summary = root.querySelector(".visitor-map__summary");
  const markers = root.querySelector(".visitor-map__markers");
  const namespace = "http://www.w3.org/2000/svg";
  let requestNumber = 0;

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

  function requestData(path, parameters) {
    return new Promise((resolve, reject) => {
      const callback = `hangZhenVisitorMap_${Date.now()}_${requestNumber++}`;
      const script = document.createElement("script");
      const url = new URL(path, "https://mapmyvisitors.com");
      for (const [key, value] of Object.entries(parameters)) {
        url.searchParams.set(key, String(value));
      }
      url.searchParams.set("callback", callback);

      const cleanup = () => {
        clearTimeout(timer);
        script.remove();
        delete window[callback];
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Visitor data request timed out"));
      }, 12000);

      window[callback] = (payload) => {
        cleanup();
        if (typeof payload === "string") resolve(payload);
        else reject(new Error("Unexpected visitor data"));
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("Visitor data could not be loaded"));
      };
      script.async = true;
      script.src = url.href;
      document.head.appendChild(script);
    });
  }

  function readLocations(payload) {
    if (/Domain was not found|ClustrMaps error/i.test(payload)) {
      throw new Error("Visitor statistics are unavailable");
    }

    // The service returns its legacy rendering instructions as text. Read only
    // the location fields; never evaluate those instructions or load its UI.
    const text = payload.replace(/\/\*[\s\S]*?\*\//g, "");
    const expression = /latLng:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*,\s*name:\s*("(?:\\.|[^"\\])*")/g;
    const locations = new Map();
    for (const match of text.matchAll(expression)) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
      const label = JSON.parse(match[3]);
      locations.set(`${latitude.toFixed(4)},${longitude.toFixed(4)}`, {
        latitude, longitude, label
      });
    }
    return Array.from(locations.values());
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
    // The image endpoint records visits; the JSONP endpoints only read them.
    // Match the production origin so local previews do not pollute statistics.
    if (location.origin !== new URL(root.dataset.siteUrl).origin) {
      root.dataset.trackingState = "preview";
      return Promise.resolve();
    }
    root.dataset.trackingState = "loading";
    return new Promise((resolve) => {
      const pixel = new Image(1, 1);
      const url = new URL("/map.png", "https://mapmyvisitors.com");
      url.searchParams.set("d", root.dataset.widgetId);
      url.searchParams.set("cl", "ffffff");
      url.searchParams.set("_", String(Date.now()));
      const finish = (state) => {
        clearTimeout(timer);
        pixel.onload = pixel.onerror = null;
        root.dataset.trackingState = state;
        resolve();
      };
      const timer = setTimeout(() => finish("unavailable"), 8000);
      pixel.onload = () => finish("sent");
      pixel.onerror = () => finish("unavailable");
      pixel.alt = "";
      pixel.hidden = true;
      pixel.referrerPolicy = "strict-origin-when-cross-origin";
      root.appendChild(pixel);
      pixel.src = url.href;
    });
  }

  let projectId;
  let cachedLocations = [];
  let refreshing = false;

  async function refreshVisitors() {
    if (refreshing) return;
    refreshing = true;
    try {
      if (!projectId) {
        const metadata = await requestData("/widget_call_home.js", {
          d: root.dataset.widgetId,
          w: 720
        });
        const match = metadata.match(/["']project_id["']\s*:\s*(\d+)/);
        if (!match) throw new Error("Visitor project could not be found");
        projectId = match[1];
        cachedLocations = readLocations(metadata);
      }
      const payload = await requestData("/ajax/map", {
        id: projectId,
        user: 0,
        url: JSON.stringify(root.dataset.siteUrl),
        initial: true,
        initial_hit_id: 0,
        last_hit_id: 0,
        animate: false,
        globalTotal: false,
        mapType: "widget"
      });
      const latest = new Map();
      for (const point of [...cachedLocations, ...readLocations(payload)]) {
        latest.set(`${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`, point);
      }
      locations = Array.from(latest.values());
      drawLocations(locations);
      const recordingUnavailable = root.dataset.trackingState === "unavailable";
      summary.textContent = recordingUnavailable ? "Visit recording is temporarily unavailable." : "";
      summary.hidden = !recordingUnavailable;
      root.dataset.state = locations.length ? "ready" : "empty";
      root.dataset.updatedAt = new Date().toISOString();
    } catch (error) {
      summary.textContent = "Visitor data is temporarily unavailable.";
      summary.hidden = false;
      root.dataset.state = "unavailable";
    } finally {
      refreshing = false;
    }
  }

  async function startVisitors() {
    await recordVisit();
    await refreshVisitors();
    // Refresh the map without recording an extra page view for an open tab.
    setInterval(() => {
      if (!document.hidden) refreshVisitors();
    }, 30000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshVisitors();
    });
  }

  loadMap();
  startVisitors();
})();
