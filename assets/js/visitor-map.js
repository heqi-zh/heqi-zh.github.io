(() => {
  "use strict";

  const root = document.getElementById("visitor-map-panel");
  if (!root) return;

  const summary = root.querySelector(".visitor-map__summary");
  const markers = root.querySelector(".visitor-map__markers");
  const namespace = "http://www.w3.org/2000/svg";
  let requestNumber = 0;

  // Asia/Pacific-centred Mercator; matches scripts/build-visitor-map.py.
  function project(latitude, longitude) {
    const relativeLongitude = ((longitude - 150 + 540) % 360) - 180;
    const latitudeRadians = Math.max(-60, Math.min(85, latitude)) * Math.PI / 180;
    return [500 + 150 * relativeLongitude * Math.PI / 180,
      380 - 150 * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))];
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

  function drawLocations(locations) {
    markers.replaceChildren();
    for (const location of locations) {
      const [x, y] = project(location.latitude, location.longitude);
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

  async function loadVisitors() {
    try {
      // This is the existing service's visit-recording request. Its statistics
      // remain the source of truth; only presentation is replaced here.
      const metadata = await requestData("/widget_call_home.js", {
        d: root.dataset.widgetId,
        w: 720
      });
      const projectId = metadata.match(/["']project_id["']\s*:\s*(\d+)/);
      if (!projectId) throw new Error("Visitor project could not be found");
      const payload = await requestData("/ajax/map", {
        id: projectId[1],
        user: 0,
        url: JSON.stringify(root.dataset.siteUrl),
        initial: true,
        initial_hit_id: 0,
        last_hit_id: 0,
        animate: false,
        globalTotal: false,
        mapType: "widget"
      });
      const locations = readLocations(payload);
      drawLocations(locations);
      summary.textContent = "";
      summary.hidden = true;
      root.dataset.state = locations.length ? "ready" : "empty";
    } catch (error) {
      summary.textContent = "Visitor data is temporarily unavailable.";
      summary.hidden = false;
      root.dataset.state = "unavailable";
    }
  }

  loadVisitors();
})();
