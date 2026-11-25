/**
 * Leaflet map controller for Nebeng Motor Searah.
 * Resolves real road routes through the public OSRM API and manages the
 * draggable passenger pickup marker.
 */

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const EARTH_RADIUS_KM = 6371.0088;
const FETCH_TIMEOUT_MS = 12000;
const DEFAULT_CENTER = { lat: -6.2036, lng: 106.7296 };
const DEFAULT_ZOOM = 12;

const PIN_COLORS = {
  start: '#059669',
  end: '#dc2626',
  waypoint: '#0f172a',
  pickup: '#f59e0b',
};

function isCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidLatLng(value) {
  return (
    Boolean(value) &&
    isCoordinate(value.lat) &&
    isCoordinate(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180
  );
}

function roundKm(value) {
  return Math.round(value * 100) / 100;
}

function normalizePlace(place, label) {
  if (!place || typeof place !== 'object') {
    throw new TypeError(`${label} wajib berupa objek { name, lat, lng }.`);
  }

  const lat = Number(place.lat);
  const lng = Number(place.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new TypeError(`${label} memiliki koordinat yang tidak valid.`);
  }

  return { name: String(place.name ?? '').trim(), lat, lng };
}

function createPinIcon(kind, glyph) {
  const color = PIN_COLORS[kind] ?? PIN_COLORS.waypoint;
  const size = kind === 'pickup' ? 30 : 26;

  return L.divIcon({
    className: 'nebeng-map-pin',
    html: `<span style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:999px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.35);font-size:${
      kind === 'pickup' ? 13 : 11
    }px;font-weight:800;line-height:1">${glyph}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function buildPopup(kicker, title) {
  const wrapper = document.createElement('div');
  wrapper.style.minWidth = '150px';

  const small = document.createElement('p');
  small.textContent = kicker;
  small.style.cssText =
    'margin:0 0 2px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b';

  const strong = document.createElement('strong');
  strong.textContent = title;
  strong.style.cssText = 'display:block;font-size:13px;line-height:1.35;color:#0f172a';

  wrapper.append(small, strong);
  return wrapper;
}

/**
 * Great-circle distance between two points in kilometres.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number}
 */
export function haversineKm(a, b) {
  if (!isValidLatLng(a) || !isValidLatLng(b)) {
    throw new TypeError('haversineKm membutuhkan dua koordinat { lat, lng } yang valid.');
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Shortest Haversine distance from a point to any point in a list.
 * @param {{ lat: number, lng: number }} point
 * @param {Array<{ lat: number, lng: number }>} points
 * @returns {number|null} Kilometres, or null when the list is empty.
 */
export function shortestDistanceToPointsKm(point, points = []) {
  if (!isValidLatLng(point)) {
    throw new TypeError('shortestDistanceToPointsKm membutuhkan koordinat { lat, lng } yang valid.');
  }

  let shortest = Infinity;
  for (const candidate of points) {
    if (!isValidLatLng(candidate)) continue;
    const distance = haversineKm(point, candidate);
    if (distance < shortest) shortest = distance;
  }

  return Number.isFinite(shortest) ? shortest : null;
}

export class RideMap {
  /**
   * @param {Object} [options]
   * @param {string} [options.elementId='map']
   * @param {number} [options.maxDetourKm=5]
   * @param {{ lat: number, lng: number }} [options.center]
   * @param {number} [options.zoom]
   * @param {string} [options.tileUrl]
   * @param {string} [options.attribution]
   * @param {(pickup: Object|null) => void} [options.onPickupChange]
   * @param {(error: Error) => void} [options.onRouteError]
   */
  constructor(options = {}) {
    this.elementId = options.elementId ?? 'map';
    this.maxDetourKm = Number.isFinite(options.maxDetourKm) ? options.maxDetourKm : 5;
    this.tileUrl = options.tileUrl ?? OSM_TILE_URL;
    this.attribution = options.attribution ?? OSM_ATTRIBUTION;
    this.center = isValidLatLng(options.center) ? { ...options.center } : { ...DEFAULT_CENTER };
    this.zoom = Number.isFinite(options.zoom) ? options.zoom : DEFAULT_ZOOM;
    this.onPickupChange = typeof options.onPickupChange === 'function' ? options.onPickupChange : null;
    this.onRouteError = typeof options.onRouteError === 'function' ? options.onRouteError : null;

    this.map = null;
    this.routeLine = null;
    this.routeMarkers = [];
    this.routePoints = [];
    this.routeWaypoints = [];
    this.pickupMarker = null;
    this.detourCircle = null;
    this.pickupLatLng = null;
    this.pickupPinnedByUser = false;
    this.abortController = null;
    this.requestId = 0;

    this.init();
  }

  /**
   * Create the Leaflet map, tile layer, pickup marker, and detour radius.
   * @returns {import('leaflet').Map}
   */
  init() {
    if (this.map) return this.map;

    try {
      if (typeof L === 'undefined') {
        throw new Error('Leaflet belum dimuat. Pastikan leaflet.js dimuat sebelum modul ini.');
      }

      const element = document.getElementById(this.elementId);
      if (!element) {
        throw new Error(`Elemen #${this.elementId} tidak ditemukan.`);
      }

      this.map = L.map(element, { zoomControl: true }).setView(
        [this.center.lat, this.center.lng],
        this.zoom
      );

      L.tileLayer(this.tileUrl, {
        maxZoom: 19,
        attribution: this.attribution,
      }).addTo(this.map);

      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(this.map);

      this.#initPickupMarker();
      this.map.on('click', (event) => this.#handleMapClick(event));

      return this.map;
    } catch (error) {
      console.error('[RideMap] Gagal menginisialisasi peta:', error);
      throw error;
    }
  }

  /**
   * Fetch the road route through OSRM, then draw the polyline and markers.
   * Falls back to a dashed straight line when OSRM is unavailable.
   * @param {Object} routeData
   * @param {string} [routeData.id]
   * @param {string} [routeData.name]
   * @param {{ name: string, lat: number, lng: number }} routeData.startPoint
   * @param {{ name: string, lat: number, lng: number }} routeData.endPoint
   * @param {Array<{ name: string, lat: number, lng: number }>} [routeData.waypoints]
   * @returns {Promise<Object|null>}
   */
  async drawRoute(routeData) {
    if (!this.map) {
      throw new Error('Peta belum siap. Panggil init() terlebih dahulu.');
    }

    const route = this.#normalizeRoute(routeData);
    const points = [route.start, ...route.waypoints, route.end];

    this.#abortPendingRequest();
    this.clearRoute();
    this.#addRouteMarkers(route);
    this.routeWaypoints = points.map(({ lat, lng }) => ({ lat, lng }));

    if (!this.pickupPinnedByUser) {
      this.setPickupLocation(route.start.lat, route.start.lng, {
        pan: false,
        userInitiated: false,
      });
    }

    const controller = new AbortController();
    this.abortController = controller;
    const requestId = ++this.requestId;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(this.#buildOsrmUrl(points), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`OSRM membalas HTTP ${response.status}.`);
      }

      const data = await response.json();
      if (requestId !== this.requestId) return null;

      if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
        throw new Error(`OSRM tidak menemukan rute (${data.code ?? 'tanpa kode'}).`);
      }

      const bestRoute = data.routes[0];
      const latlngs = bestRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      this.routePoints = latlngs.map(([lat, lng]) => ({ lat, lng }));

      this.routeLine = L.polyline(latlngs, {
        color: '#059669',
        weight: 5,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
        interactive: false,
      }).addTo(this.map);

      this.#fitToRoute(latlngs);
      this.#emitPickupChange();

      return {
        source: 'osrm',
        distanceKm: roundKm(bestRoute.distance / 1000),
        durationMin: Math.round(bestRoute.duration / 60),
        pickup: this.getPickupDistance(),
        points: this.routePoints,
      };
    } catch (error) {
      if (requestId !== this.requestId) return null;

      if (error?.name === 'AbortError' && !timedOut) {
        console.warn('[RideMap] Permintaan rute dibatalkan.');
        return null;
      }

      const failure = timedOut
        ? new Error('Permintaan rute OSRM melewati batas waktu.')
        : error;

      console.error('[RideMap] Gagal mengambil rute OSRM:', failure);
      this.#drawFallbackRoute(points);
      this.#notifyRouteError(failure);

      return {
        source: 'fallback',
        distanceKm: null,
        durationMin: null,
        pickup: this.getPickupDistance(),
        points: this.routePoints,
      };
    } finally {
      clearTimeout(timer);
      if (this.abortController === controller) this.abortController = null;
    }
  }

  /**
   * Move the pickup marker. Coordinates are validated before use.
   * @param {number} lat
   * @param {number} lng
   * @param {{ pan?: boolean, userInitiated?: boolean }} [options]
   * @returns {Object|null} Result from getPickupDistance().
   */
  setPickupLocation(lat, lng, options = {}) {
    const { pan = false, userInitiated = true } = options;

    if (!this.map || !this.pickupMarker) {
      throw new Error('Peta belum siap. Panggil init() terlebih dahulu.');
    }

    const next = { lat: Number(lat), lng: Number(lng) };
    if (!isValidLatLng(next)) {
      throw new TypeError('Koordinat titik jemput tidak valid.');
    }

    this.pickupLatLng = next;
    this.pickupMarker.setLatLng([next.lat, next.lng]);
    this.detourCircle?.setLatLng([next.lat, next.lng]);

    if (userInitiated) this.pickupPinnedByUser = true;
    if (pan) {
      this.map.flyTo([next.lat, next.lng], Math.max(this.map.getZoom(), 14), { duration: 0.6 });
    }

    this.#emitPickupChange();
    return this.getPickupDistance();
  }

  /**
   * Ask the browser for the passenger's current position.
   * @param {PositionOptions} [geolocationOptions]
   * @returns {Promise<Object>} Pickup info ({ lat, lng, distanceKm, isOutOfRoute }).
   */
  locateUser(geolocationOptions = {}) {
    if (!this.map) {
      return Promise.reject(new Error('Peta belum siap. Panggil init() terlebih dahulu.'));
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.reject(new Error('Perangkat ini tidak mendukung geolokasi.'));
    }

    return new Promise((resolve, reject) => {
      try {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            try {
              const result = this.setPickupLocation(
                position.coords.latitude,
                position.coords.longitude,
                { pan: true }
              );
              resolve(result);
            } catch (error) {
              reject(error);
            }
          },
          (error) => {
            const messages = {
              1: 'Izin lokasi ditolak. Aktifkan izin lokasi lalu coba lagi.',
              2: 'Lokasi tidak tersedia saat ini.',
              3: 'Permintaan lokasi melewati batas waktu.',
            };
            reject(new Error(messages[error.code] ?? 'Gagal mengambil lokasi.'));
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
            ...geolocationOptions,
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Shortest distance from the pickup marker to the route geometry and waypoints.
   * @returns {{ lat: number, lng: number, distanceKm: number|null, isOutOfRoute: boolean }|null}
   */
  getPickupDistance() {
    if (!this.pickupLatLng) return null;

    const candidates = [...this.routePoints, ...this.routeWaypoints];
    const distanceKm = shortestDistanceToPointsKm(this.pickupLatLng, candidates);

    return {
      lat: this.pickupLatLng.lat,
      lng: this.pickupLatLng.lng,
      distanceKm: distanceKm === null ? null : roundKm(distanceKm),
      isOutOfRoute: distanceKm === null ? false : distanceKm > this.maxDetourKm,
    };
  }

  /**
   * Remove the route polyline and its markers.
   */
  clearRoute() {
    if (!this.map) return;

    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
      this.routeLine = null;
    }

    for (const marker of this.routeMarkers) {
      this.map.removeLayer(marker);
    }

    this.routeMarkers = [];
    this.routePoints = [];
    this.routeWaypoints = [];
  }

  /**
   * Tear down the map and cancel any in-flight route request.
   */
  destroy() {
    try {
      this.#abortPendingRequest();
      this.requestId += 1;

      if (this.map) {
        this.map.off();
        this.map.remove();
      }
    } catch (error) {
      console.error('[RideMap] Gagal membersihkan peta:', error);
    } finally {
      this.map = null;
      this.routeLine = null;
      this.routeMarkers = [];
      this.routePoints = [];
      this.routeWaypoints = [];
      this.pickupMarker = null;
      this.detourCircle = null;
      this.pickupLatLng = null;
    }
  }

  #initPickupMarker() {
    this.pickupLatLng = { ...this.center };

    this.pickupMarker = L.marker([this.center.lat, this.center.lng], {
      draggable: true,
      autoPan: true,
      icon: createPinIcon('pickup', '●'),
      title: 'Titik jemput penumpang',
      zIndexOffset: 1000,
    }).addTo(this.map);

    this.pickupMarker.bindTooltip('Geser pin atau ketuk peta untuk titik jemput', {
      direction: 'top',
      offset: [0, -16],
    });

    this.pickupMarker.on('drag', () => this.#syncPickupFromMarker(false));
    this.pickupMarker.on('dragend', () => this.#syncPickupFromMarker(true));

    this.detourCircle = L.circle([this.center.lat, this.center.lng], {
      radius: this.maxDetourKm * 1000,
      color: '#f59e0b',
      weight: 1,
      dashArray: '4 6',
      fillColor: '#f59e0b',
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(this.map);
  }

  #syncPickupFromMarker(notify) {
    if (!this.pickupMarker) return;

    const { lat, lng } = this.pickupMarker.getLatLng();
    this.pickupLatLng = { lat, lng };
    this.detourCircle?.setLatLng([lat, lng]);

    if (notify) {
      this.pickupPinnedByUser = true;
      this.#emitPickupChange();
    }
  }

  #handleMapClick(event) {
    try {
      this.setPickupLocation(event.latlng.lat, event.latlng.lng);
    } catch (error) {
      console.error('[RideMap] Gagal memindahkan titik jemput:', error);
    }
  }

  #normalizeRoute(routeData) {
    if (!routeData || typeof routeData !== 'object') {
      throw new TypeError('routeData wajib berupa objek rute.');
    }

    const start = normalizePlace(routeData.startPoint, 'startPoint');
    const end = normalizePlace(routeData.endPoint, 'endPoint');
    const rawWaypoints = routeData.waypoints ?? [];

    if (!Array.isArray(rawWaypoints)) {
      throw new TypeError('waypoints wajib berupa array.');
    }

    const waypoints = rawWaypoints.map((waypoint, index) =>
      normalizePlace(waypoint, `waypoints[${index}]`)
    );

    return {
      id: String(routeData.id ?? ''),
      name: String(routeData.name ?? 'Rute harian').trim(),
      start,
      end,
      waypoints,
    };
  }

  #addRouteMarkers(route) {
    this.#addMarker(route.start, 'start', 'A', 'Titik awal', route.name);
    route.waypoints.forEach((waypoint, index) => {
      this.#addMarker(waypoint, 'waypoint', String(index + 1), `Titik temu ${index + 1}`, waypoint.name);
    });
    this.#addMarker(route.end, 'end', 'B', 'Tujuan', route.name);
  }

  #addMarker(place, kind, glyph, kicker, fallbackTitle) {
    const marker = L.marker([place.lat, place.lng], {
      icon: createPinIcon(kind, glyph),
      title: place.name || kicker,
      riseOnHover: true,
    }).addTo(this.map);

    const title = place.name || fallbackTitle || kicker;
    marker.bindTooltip(title, { direction: 'top', offset: [0, -14] });
    marker.bindPopup(buildPopup(kicker, title));
    this.routeMarkers.push(marker);
    return marker;
  }

  #buildOsrmUrl(points) {
    const coordinates = points.map(({ lat, lng }) => `${lng},${lat}`).join(';');
    return `${OSRM_BASE_URL}/${coordinates}?overview=full&geometries=geojson&steps=false&alternatives=false`;
  }

  #drawFallbackRoute(points) {
    const latlngs = points.map(({ lat, lng }) => [lat, lng]);
    this.routePoints = points.map(({ lat, lng }) => ({ lat, lng }));

    this.routeLine = L.polyline(latlngs, {
      color: '#059669',
      weight: 4,
      opacity: 0.85,
      dashArray: '8 8',
      lineJoin: 'round',
      interactive: false,
    }).addTo(this.map);

    this.#fitToRoute(latlngs);
    this.#emitPickupChange();
  }

  #fitToRoute(latlngs) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return;

    const bounds = L.latLngBounds(latlngs);
    if (!bounds.isValid()) return;

    this.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  }

  #emitPickupChange() {
    const info = this.getPickupDistance();

    try {
      const container = this.map?.getContainer();
      if (container && typeof CustomEvent === 'function') {
        container.dispatchEvent(
          new CustomEvent('nebeng:pickupchange', { detail: info, bubbles: true })
        );
      }
    } catch (error) {
      console.warn('[RideMap] Gagal mengirim event pickup:', error);
    }

    if (!this.onPickupChange) return;

    try {
      this.onPickupChange(info);
    } catch (error) {
      console.error('[RideMap] Callback onPickupChange gagal:', error);
    }
  }

  #notifyRouteError(error) {
    if (!this.onRouteError) return;

    try {
      this.onRouteError(error);
    } catch (callbackError) {
      console.error('[RideMap] Callback onRouteError gagal:', callbackError);
    }
  }

  #abortPendingRequest() {
    if (!this.abortController) return;
    this.abortController.abort();
    this.abortController = null;
  }
}
