/**
 * Nebeng Motor Searah — application entry point.
 * Connects rider data, route selection, the Leaflet map, WhatsApp checkout,
 * and the admin panel.
 */

import { RIDER_CONFIG, ROUTES } from './config.js';
import { RideMap } from './map.js';
import { buildWhatsAppUrl } from './whatsapp.js';
import { initAdminPanel } from './admin.js';

const SUBMIT_LABELS = {
  available: 'Lanjut ke WhatsApp',
  booked: "Today's Seats Are Fully Booked",
  offline: 'Rider Is Offline Today',
};

const state = {
  selectedRouteId: ROUTES[0]?.id ?? null,
  admin: { status: 'available', departureTime: '' },
  activeTab: 'ride',
};

const els = {};
let rideMap = null;
let adminPanel = null;

function setText(element, text) {
  if (element) element.textContent = text;
}

function formatRupiah(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '—';

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getInitials(name) {
  return (
    String(name ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'NB'
  );
}

function routeDisplayName(route) {
  const name = String(route?.name ?? '').trim();
  const [, ...rest] = name.split('·');
  return rest.length ? rest.join('·').trim() : name;
}

function getSelectedRoute() {
  return ROUTES.find((route) => route.id === state.selectedRouteId) ?? null;
}

function getEffectiveDepartureTime(route) {
  if (!route) return '';
  return state.admin.departureTime || route.departureTime;
}

function getMeetingPoints(route) {
  if (!route) return [];
  if (Array.isArray(route.waypoints) && route.waypoints.length > 0) return route.waypoints;
  return [route.startPoint, route.endPoint].filter(Boolean);
}

function getSelectedOptionText(select) {
  const option = select?.selectedOptions?.[0];
  return option ? option.textContent.trim() : '';
}

function cacheElements() {
  els.riderName = document.getElementById('rider-name');
  els.riderAvatar = document.getElementById('rider-avatar');
  els.riderMotor = document.getElementById('rider-motor');
  els.riderPlate = document.getElementById('rider-plate');
  els.riderHelmet = document.getElementById('rider-helmet');
  els.riderDetour = document.getElementById('rider-detour');
  els.riderSchedule = document.getElementById('rider-schedule');
  els.maxDetourNote = document.getElementById('max-detour-note');

  els.routeCards = document.getElementById('route-cards');
  els.contributionAmount = document.getElementById('contribution-amount');

  els.detourChip = document.getElementById('detour-indicator');
  els.detourValue = document.getElementById('detour-value');
  els.mapStatus = document.getElementById('map-status');
  els.locateButton = document.getElementById('btn-locate');

  els.tabs = [...document.querySelectorAll('[role="tab"][data-tab]')];
  els.panels = {
    ride: document.getElementById('panel-ride'),
    package: document.getElementById('panel-package'),
  };

  els.rideForm = document.getElementById('booking-form');
  els.packageForm = document.getElementById('package-form');

  els.rideRouteSelect = document.getElementById('route-select');
  els.packageRouteSelect = document.getElementById('package-route-select');
  els.rideMeetingPoint = document.getElementById('meeting-point-select');
  els.packageMeetingPoint = document.getElementById('package-meeting-point');
  els.ridePickupLandmark = document.getElementById('pickup-landmark');
  els.packagePickupLandmark = document.getElementById('package-pickup-landmark');

  els.luggage = document.getElementById('luggage');
  els.passengerName = document.getElementById('passenger-name');
  els.socialMedia = document.getElementById('social-media');

  els.packageSize = document.getElementById('package-size');
  els.packageDescription = document.getElementById('package-description');
  els.recipientName = document.getElementById('recipient-name');
  els.recipientPhone = document.getElementById('recipient-phone');
  els.packageSocialMedia = document.getElementById('package-social-media');

  els.rideSubmit = document.getElementById('ride-submit');
  els.rideSubmitLabel = document.getElementById('ride-submit-label');
  els.packageSubmit = document.getElementById('package-submit');
  els.packageSubmitLabel = document.getElementById('package-submit-label');

  els.checkoutMessage = document.getElementById('checkout-message');
}

function hydrateRiderProfile() {
  setText(els.riderName, RIDER_CONFIG.name);
  setText(els.riderAvatar, getInitials(RIDER_CONFIG.name));
  setText(els.riderMotor, `${RIDER_CONFIG.motorcycle.type} · ${RIDER_CONFIG.motorcycle.color}`);
  setText(els.riderPlate, RIDER_CONFIG.licensePlate);
  setText(els.riderHelmet, RIDER_CONFIG.spareHelmet ? 'Tersedia' : 'Tidak tersedia');
  setText(els.riderDetour, String(RIDER_CONFIG.maxDetourKm));
  setText(els.riderSchedule, `${ROUTES.length} rute/hari`);
  setText(els.maxDetourNote, `${RIDER_CONFIG.maxDetourKm} km`);

  document.querySelectorAll('a[href^="https://wa.me/"]').forEach((link) => {
    link.href = `https://wa.me/${RIDER_CONFIG.whatsappNumber}`;
  });
}

function renderRouteCards() {
  if (!els.routeCards) return;

  els.routeCards.innerHTML = '';

  if (ROUTES.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-sm text-slate-500';
    empty.textContent = 'Belum ada jadwal rute.';
    els.routeCards.append(empty);
    return;
  }

  for (const route of ROUTES) {
    const label = document.createElement('label');
    label.className = 'route-card';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'routeCard';
    input.value = route.id;
    input.className = 'route-card-input';
    input.checked = route.id === state.selectedRouteId;
    input.addEventListener('change', () => {
      if (input.checked) selectRoute(route.id);
    });

    const body = document.createElement('span');
    body.className = 'route-card-body';

    const top = document.createElement('span');
    top.className = 'route-card-top';

    const period = document.createElement('span');
    period.className = `route-card-period route-card-period--${route.period}`;
    period.textContent = route.period === 'morning' ? 'Pagi' : 'Sore';

    const time = document.createElement('span');
    time.className = 'route-card-time';
    time.dataset.routeTime = route.id;
    time.textContent = getEffectiveDepartureTime(route);

    top.append(period, time);

    const name = document.createElement('span');
    name.className = 'route-card-name';
    name.textContent = routeDisplayName(route);

    const meta = document.createElement('span');
    meta.className = 'route-card-meta';
    const start = route.startPoint.name.split(',')[0].trim();
    const end = route.endPoint.name.split(',')[0].trim();
    meta.textContent = `${start} → ${end}`;

    const price = document.createElement('span');
    price.className = 'route-card-price';
    price.textContent = `${getMeetingPoints(route).length} titik temu · ${formatRupiah(
      route.baseContribution
    )}`;

    body.append(top, name, meta, price);
    label.append(input, body);
    els.routeCards.append(label);
  }
}

function populateRouteSelects() {
  for (const select of [els.rideRouteSelect, els.packageRouteSelect]) {
    if (!select) continue;

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Pilih rute';
    placeholder.disabled = true;
    placeholder.selected = !state.selectedRouteId;
    select.append(placeholder);

    for (const route of ROUTES) {
      const option = document.createElement('option');
      option.value = route.id;
      option.textContent = `${route.name} · ${getEffectiveDepartureTime(route)}`;
      select.append(option);
    }

    if (state.selectedRouteId) select.value = state.selectedRouteId;
  }
}

function updateRouteTimes() {
  document.querySelectorAll('[data-route-time]').forEach((element) => {
    const route = ROUTES.find((item) => item.id === element.dataset.routeTime);
    if (route) element.textContent = getEffectiveDepartureTime(route);
  });

  populateRouteSelects();
}

function syncRouteControls(routeId) {
  document.querySelectorAll('input[name="routeCard"]').forEach((input) => {
    input.checked = input.value === routeId;
  });

  for (const select of [els.rideRouteSelect, els.packageRouteSelect]) {
    if (select) select.value = routeId;
  }
}

function updateMeetingPointOptions(route) {
  const points = getMeetingPoints(route);

  for (const select of [els.rideMeetingPoint, els.packageMeetingPoint]) {
    if (!select) continue;

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = points.length ? 'Pilih titik temu' : 'Belum ada titik temu';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);

    points.forEach((point, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = point.name;
      select.append(option);
    });

    select.disabled = points.length === 0;
  }

  if (els.ridePickupLandmark) {
    els.ridePickupLandmark.placeholder = 'Contoh: depan Alfamart dekat titik temu';
  }
  if (els.packagePickupLandmark) {
    els.packagePickupLandmark.placeholder = 'Contoh: lobi apartemen dekat titik temu';
  }
}

function updateContribution(route) {
  setText(els.contributionAmount, route ? formatRupiah(route.baseContribution) : '—');
}

function setMapStatus(message, isError = false) {
  if (!els.mapStatus) return;
  els.mapStatus.textContent = message;
  els.mapStatus.dataset.state = isError ? 'error' : 'info';
}

function renderPickupFeedback(info) {
  if (!els.detourChip || !els.detourValue) return;

  if (!info || info.distanceKm === null || !Number.isFinite(info.distanceKm)) {
    els.detourChip.dataset.state = 'idle';
    els.detourValue.textContent = '—';
    els.detourChip.setAttribute('aria-label', 'Jarak titik jemput ke rute belum tersedia.');
    els.detourChip.removeAttribute('title');
    return;
  }

  const distance = info.distanceKm;
  const outOfRoute = info.isOutOfRoute || distance > RIDER_CONFIG.maxDetourKm;
  const label = outOfRoute
    ? `Detour ${distance.toFixed(2)} km, di luar batas ${RIDER_CONFIG.maxDetourKm} km.`
    : `Detour ${distance.toFixed(2)} km, masih dalam batas ${RIDER_CONFIG.maxDetourKm} km.`;

  els.detourChip.dataset.state = outOfRoute ? 'warn' : 'ok';
  els.detourValue.textContent = distance.toFixed(2);
  els.detourChip.setAttribute('aria-label', label);
  els.detourChip.title = label;
}

function initMap() {
  try {
    rideMap = new RideMap({
      maxDetourKm: RIDER_CONFIG.maxDetourKm,
      onPickupChange: renderPickupFeedback,
      onRouteError: (error) => {
        console.warn('[App] OSRM fallback aktif:', error);
        setMapStatus('Rute jalan tidak tersedia; menampilkan garis lurus sementara.', true);
      },
    });
  } catch (error) {
    console.error('[App] Gagal memuat peta:', error);
    rideMap = null;
    setMapStatus('Peta gagal dimuat. Periksa koneksi lalu muat ulang halaman.', true);
  }
}

function selectRoute(routeId) {
  const route = ROUTES.find((item) => item.id === routeId);
  if (!route) return;

  state.selectedRouteId = route.id;
  syncRouteControls(route.id);
  updateMeetingPointOptions(route);
  updateContribution(route);
  clearCheckoutMessage();
  setMapStatus('');

  if (!rideMap) return;

  try {
    rideMap.setPickupLocation(route.startPoint.lat, route.startPoint.lng, {
      userInitiated: false,
    });
  } catch (error) {
    console.warn('[App] Gagal mereset titik jemput:', error);
  }

  rideMap.drawRoute(route).catch((error) => {
    console.error('[App] Gagal menggambar rute:', error);
    setMapStatus('Rute tidak dapat dimuat. Coba pilih jadwal lain.', true);
  });
}

function activateTab(name, { focus = false } = {}) {
  const tab = els.tabs.find((item) => item.dataset.tab === name);
  if (!tab) return;

  state.activeTab = name;

  for (const item of els.tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
  }

  for (const [key, panel] of Object.entries(els.panels)) {
    if (panel) panel.hidden = key !== name;
  }

  clearCheckoutMessage();
  if (focus) tab.focus();
}

function initHelmetOptions() {
  if (!els.rideForm) return;

  const ownRadio = els.rideForm.querySelector('input[name="helmet"][value="own"]');
  const spareRadio = els.rideForm.querySelector('input[name="helmet"][value="spare"]');

  if (!RIDER_CONFIG.spareHelmet && spareRadio) {
    spareRadio.disabled = true;
    if (ownRadio) ownRadio.checked = true;

    const spareHint = spareRadio.closest('.choice-card')?.querySelector('.text-xs');
    if (spareHint) spareHint.textContent = 'Helm cadangan tidak tersedia';
  }
}

function initAdmin() {
  try {
    adminPanel = initAdminPanel({
      riderName: RIDER_CONFIG.name,
      routeLabel: 'Meruya Selatan ↔ Sudirman',
      contribution: ROUTES[0]?.baseContribution ?? null,
      defaultDepartureTime: '',
      onChange: (nextState) => {
        state.admin = nextState;
        updateRouteTimes();
        updateSubmitState(nextState.status);
      },
      onError: (error) => console.error('[App] Admin panel error:', error),
    });

    state.admin = adminPanel.getState();
  } catch (error) {
    console.error('[App] Gagal menginisialisasi panel admin:', error);
    state.admin = { status: 'available', departureTime: '' };
  }
}

function updateSubmitState(status) {
  const disabled = status !== 'available';
  const label = SUBMIT_LABELS[status] ?? SUBMIT_LABELS.available;

  for (const [button, labelElement] of [
    [els.rideSubmit, els.rideSubmitLabel],
    [els.packageSubmit, els.packageSubmitLabel],
  ]) {
    if (!button) continue;
    button.disabled = disabled;
    if (labelElement) labelElement.textContent = label;
    button.title = disabled ? 'Pemesanan ditutup sementara.' : '';
  }
}

function showCheckoutMessage(message, type = 'error', linkUrl = '') {
  if (!els.checkoutMessage) return;

  els.checkoutMessage.textContent = message;

  if (linkUrl) {
    els.checkoutMessage.append(' ');
    const link = document.createElement('a');
    link.href = linkUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Buka WhatsApp';
    els.checkoutMessage.append(link);
  }

  els.checkoutMessage.dataset.state = type;
  els.checkoutMessage.hidden = false;
}

function clearCheckoutMessage() {
  if (!els.checkoutMessage) return;
  els.checkoutMessage.hidden = true;
  els.checkoutMessage.textContent = '';
  delete els.checkoutMessage.dataset.state;
}

function submitBooking(bookingData) {
  try {
    const url = buildWhatsAppUrl(RIDER_CONFIG.whatsappNumber, bookingData);
    clearCheckoutMessage();

    const opened = window.open(url, '_blank');
    if (opened) {
      opened.opener = null;
    } else {
      showCheckoutMessage('Popup diblokir browser. Buka WhatsApp manual:', 'error', url);
    }
  } catch (error) {
    console.error('[App] Gagal membuat tautan WhatsApp:', error);
    showCheckoutMessage(error.message || 'Pesanan tidak dapat diproses.', 'error');
  }
}

function handleRideSubmit(event) {
  event.preventDefault();

  try {
    if (state.admin.status !== 'available') {
      showCheckoutMessage('Pemesanan belum bisa diproses karena status rider belum Available.', 'error');
      return;
    }

    if (!els.rideForm || !els.rideForm.reportValidity()) return;

    const route = getSelectedRoute();
    if (!route) {
      showCheckoutMessage('Pilih rute terlebih dahulu.', 'error');
      return;
    }

    const pickup = rideMap?.getPickupDistance() ?? null;
    if (!pickup || !Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) {
      showCheckoutMessage('Tandai titik jemput di peta terlebih dahulu.', 'error');
      return;
    }

    const helmet = els.rideForm.querySelector('input[name="helmet"]:checked')?.value ?? 'own';

    submitBooking({
      serviceType: 'boncengan',
      riderName: RIDER_CONFIG.name,
      passengerName: els.passengerName?.value.trim() ?? '',
      socialMedia: els.socialMedia?.value.trim() ?? '',
      routeName: route.name,
      departureTime: getEffectiveDepartureTime(route),
      meetingPoint: getSelectedOptionText(els.rideMeetingPoint),
      pickupLandmark: els.ridePickupLandmark?.value.trim() ?? '',
      pickup: { lat: pickup.lat, lng: pickup.lng },
      helmet,
      luggage: els.luggage?.value ?? 'none',
      contribution: route.baseContribution,
    });
  } catch (error) {
    console.error('[App] Gagal memproses pesanan boncengan:', error);
    showCheckoutMessage(error.message || 'Pesanan tidak dapat diproses.', 'error');
  }
}

function handlePackageSubmit(event) {
  event.preventDefault();

  try {
    if (state.admin.status !== 'available') {
      showCheckoutMessage('Pemesanan belum bisa diproses karena status rider belum Available.', 'error');
      return;
    }

    if (!els.packageForm || !els.packageForm.reportValidity()) return;

    const route = getSelectedRoute();
    if (!route) {
      showCheckoutMessage('Pilih rute terlebih dahulu.', 'error');
      return;
    }

    const pickup = rideMap?.getPickupDistance() ?? null;
    if (!pickup || !Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) {
      showCheckoutMessage('Tandai titik ambil paket di peta terlebih dahulu.', 'error');
      return;
    }

    submitBooking({
      serviceType: 'paket',
      riderName: RIDER_CONFIG.name,
      socialMedia: els.packageSocialMedia?.value.trim() ?? '',
      routeName: route.name,
      departureTime: getEffectiveDepartureTime(route),
      meetingPoint: getSelectedOptionText(els.packageMeetingPoint),
      handoverLocation: els.packagePickupLandmark?.value.trim() ?? '',
      pickup: { lat: pickup.lat, lng: pickup.lng },
      recipientName: els.recipientName?.value.trim() ?? '',
      recipientPhone: els.recipientPhone?.value.trim() ?? '',
      packageSize: els.packageSize?.value ?? 'small',
      packageDescription: els.packageDescription?.value.trim() ?? '',
      fee: route.baseContribution,
    });
  } catch (error) {
    console.error('[App] Gagal memproses pesanan paket:', error);
    showCheckoutMessage(error.message || 'Pesanan tidak dapat diproses.', 'error');
  }
}

async function handleLocateUser() {
  if (!rideMap) {
    setMapStatus('Peta belum siap. Muat ulang halaman.', true);
    return;
  }

  const button = els.locateButton;
  const originalHtml = button?.innerHTML ?? '';

  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Mencari lokasi…';
  }

  setMapStatus('Mengambil lokasi GPS…');

  try {
    const info = await rideMap.locateUser();
    renderPickupFeedback(info);
    setMapStatus('Lokasi ditemukan. Geser pin untuk menyesuaikan titik jemput.');
  } catch (error) {
    console.error('[App] Gagal mengambil lokasi:', error);
    setMapStatus(error.message || 'Gagal mengambil lokasi.', true);
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = originalHtml;
    }
  }
}

function handleMeetingPointChange(select) {
  if (!select || !select.value) return;

  const route = getSelectedRoute();
  const waypoint = getMeetingPoints(route)[Number(select.value)];
  if (!waypoint) return;

  const landmark =
    select === els.packageMeetingPoint ? els.packagePickupLandmark : els.ridePickupLandmark;
  if (landmark) landmark.placeholder = `Contoh: dekat ${waypoint.name}`;

  if (!rideMap) return;

  try {
    rideMap.setPickupLocation(waypoint.lat, waypoint.lng, { pan: true });
    setMapStatus(`Titik temu dipilih: ${waypoint.name}`);
  } catch (error) {
    console.error('[App] Gagal memindahkan titik jemput:', error);
    setMapStatus('Titik jemput tidak dapat dipindahkan.', true);
  }
}

function bindTabs() {
  for (const tab of els.tabs) {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      const index = els.tabs.indexOf(tab);
      let nextIndex = null;

      if (event.key === 'ArrowRight') nextIndex = (index + 1) % els.tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + els.tabs.length) % els.tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = els.tabs.length - 1;

      if (nextIndex === null) return;

      event.preventDefault();
      activateTab(els.tabs[nextIndex].dataset.tab, { focus: true });
    });
  }

  activateTab('ride');
}

function bindRouteEvents() {
  for (const select of [els.rideRouteSelect, els.packageRouteSelect]) {
    select?.addEventListener('change', () => {
      if (!select.value) return;
      selectRoute(select.value);
    });
  }

  for (const select of [els.rideMeetingPoint, els.packageMeetingPoint]) {
    select?.addEventListener('change', () => handleMeetingPointChange(select));
  }
}

function bindFormEvents() {
  els.rideForm?.addEventListener('submit', handleRideSubmit);
  els.packageForm?.addEventListener('submit', handlePackageSubmit);
  els.locateButton?.addEventListener('click', handleLocateUser);
}

function init() {
  try {
    cacheElements();
    hydrateRiderProfile();
    initAdmin();
    renderRouteCards();
    populateRouteSelects();
    initMap();
    bindTabs();
    bindRouteEvents();
    bindFormEvents();
    initHelmetOptions();
    updateSubmitState(state.admin.status);

    if (state.selectedRouteId) {
      selectRoute(state.selectedRouteId);
    } else {
      updateContribution(null);
      showCheckoutMessage('Belum ada jadwal rute yang tersedia.', 'error');
    }
  } catch (error) {
    console.error('[App] Gagal menginisialisasi aplikasi:', error);
    setMapStatus('Aplikasi gagal dimuat. Muat ulang halaman.', true);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
