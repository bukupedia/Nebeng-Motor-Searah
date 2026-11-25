/**
 * Admin panel controller.
 * Reads URL state, lets the rider update availability and departure time,
 * and produces a shareable link plus a WhatsApp Status message.
 */

const STATUS_LABELS = {
  available: 'Available',
  booked: 'Booked',
  offline: 'Offline',
};

const VALID_STATUSES = Object.keys(STATUS_LABELS);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_STORAGE_KEY = 'nebeng:admin-state';
const FEEDBACK_TIMEOUT_MS = 3500;

function formatRupiah(value) {
  if (value === null || value === undefined || value === '') return null;

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export class AdminPanel {
  /**
   * @param {Object} [options]
   * @param {string} [options.panelId='admin-panel']
   * @param {string} [options.statusElementId='rider-status']
   * @param {string} [options.statusLabelId='rider-status-label']
   * @param {string} [options.timeInputId='admin-departure-time']
   * @param {string} [options.shareUrlInputId='admin-share-url']
   * @param {string} [options.copyButtonId='admin-copy-status']
   * @param {string} [options.copyFeedbackId='admin-copy-feedback']
   * @param {string} [options.closeButtonId='admin-close']
   * @param {string} [options.riderName='']
   * @param {string} [options.routeLabel='']
   * @param {number} [options.contribution]
   * @param {'available'|'booked'|'offline'} [options.defaultStatus='available']
   * @param {string} [options.defaultDepartureTime='']
   * @param {string} [options.storageKey='nebeng:admin-state']
   * @param {(state: { status: string, departureTime: string }) => void} [options.onChange]
   * @param {(error: Error) => void} [options.onError]
   */
  constructor(options = {}) {
    this.options = {
      panelId: 'admin-panel',
      statusElementId: 'rider-status',
      statusLabelId: 'rider-status-label',
      timeInputId: 'admin-departure-time',
      shareUrlInputId: 'admin-share-url',
      copyButtonId: 'admin-copy-status',
      copyFeedbackId: 'admin-copy-feedback',
      closeButtonId: 'admin-close',
      riderName: '',
      routeLabel: '',
      contribution: null,
      defaultStatus: 'available',
      defaultDepartureTime: '',
      storageKey: DEFAULT_STORAGE_KEY,
      onChange: null,
      onError: null,
      ...options,
    };

    this.state = { status: 'available', departureTime: '' };
    this.adminMode = false;
    this.initialized = false;
    this.elements = {};
    this.listenerController = null;
    this.feedbackTimer = null;
  }

  /**
   * Read URL parameters, hydrate the UI, and bind the admin controls.
   * @returns {AdminPanel}
   */
  init() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return this;
    if (this.initialized) return this;

    try {
      const params = new URLSearchParams(window.location.search);
      this.adminMode = params.get('admin') === '1';

      this.#cacheElements();
      this.state = this.#resolveInitialState(params);
      this.#applyState();
      this.#bindEvents();
      this.#renderShareUrl();

      if (this.adminMode) this.#showPanel();
      this.initialized = true;
    } catch (error) {
      this.#reportError(error);
    }

    return this;
  }

  /**
   * @returns {{ status: 'available'|'booked'|'offline', departureTime: string }}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * @param {'available'|'booked'|'offline'} status
   */
  setStatus(status) {
    const next = String(status ?? '')
      .trim()
      .toLowerCase();

    if (!VALID_STATUSES.includes(next)) {
      throw new Error(`Status "${status}" tidak dikenal.`);
    }

    this.state = { ...this.state, status: next };
    this.#applyStatus();
    this.#persistState();
    this.#syncUrl();
    this.#renderShareUrl();
    this.#notifyChange();
    return this.getState();
  }

  /**
   * @param {string} value 24-hour time in HH:MM format, or an empty string.
   */
  setDepartureTime(value) {
    const time = String(value ?? '').trim();
    if (time && !TIME_PATTERN.test(time)) {
      throw new Error('Format jam harus HH:MM.');
    }

    this.state = { ...this.state, departureTime: time };
    this.#applyTime();
    this.#persistState();
    this.#syncUrl();
    this.#renderShareUrl();
    this.#notifyChange();
    return this.getState();
  }

  /**
   * Public status URL, without the admin flag.
   * @returns {string}
   */
  buildShareUrl() {
    if (typeof window === 'undefined') return '';

    try {
      const url = new URL(window.location.href);
      url.hash = '';
      url.search = '';
      url.searchParams.set('status', this.state.status);
      if (this.state.departureTime) url.searchParams.set('jam', this.state.departureTime);
      return url.toString().replace(/%3A/gi, ':');
    } catch (error) {
      console.warn('[AdminPanel] Gagal membuat link status:', error);
      return '';
    }
  }

  /**
   * Admin URL that reopens this panel.
   * @returns {string}
   */
  buildAdminUrl() {
    const shareUrl = this.buildShareUrl();
    if (!shareUrl) return '';

    try {
      const url = new URL(shareUrl);
      url.searchParams.set('admin', '1');
      return url.toString().replace(/%3A/gi, ':');
    } catch (error) {
      console.warn('[AdminPanel] Gagal membuat link admin:', error);
      return '';
    }
  }

  /**
   * Short promotional copy for WhatsApp Status.
   * @returns {string}
   */
  buildStatusMessage() {
    const statusLabel = STATUS_LABELS[this.state.status] ?? STATUS_LABELS.available;
    const title = this.options.riderName
      ? `🏍️ *Nebeng Motor Searah* — ${this.options.riderName}`
      : '🏍️ *Nebeng Motor Searah*';

    const lines = [title];
    if (this.options.routeLabel) lines.push(`Rute: ${this.options.routeLabel}`);
    lines.push(`Status: *${statusLabel}*`);
    if (this.state.departureTime) lines.push(`Berangkat: ${this.state.departureTime}`);

    const contribution = formatRupiah(this.options.contribution);
    if (contribution) lines.push(`Kontribusi bensin: ${contribution}`);

    lines.push('Boncengan & titip paket searah.');

    const shareUrl = this.buildShareUrl();
    if (shareUrl) lines.push('', `Cek & pesan: ${shareUrl}`);

    return lines.join('\n');
  }

  /**
   * Copy the promotional message to the clipboard.
   * @returns {Promise<boolean>}
   */
  async copyStatusMessage() {
    try {
      await this.#copyText(this.buildStatusMessage());
      this.#showFeedback('Status WhatsApp tersalin.');
      return true;
    } catch (error) {
      this.#reportError(error);
      this.#showFeedback('Gagal menyalin. Salin manual dari kotak link.', true);
      return false;
    }
  }

  /**
   * Show the admin panel programmatically.
   */
  showPanel() {
    this.adminMode = true;
    this.#showPanel();
    this.#syncUrl();
  }

  /**
   * Hide the panel and remove the admin flag from the address bar.
   */
  hidePanel() {
    if (!this.elements.panel) return;

    this.elements.panel.hidden = true;
    this.adminMode = false;

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      window.history.replaceState({}, '', url);
    } catch (error) {
      console.warn('[AdminPanel] Gagal memperbarui URL:', error);
    }
  }

  destroy() {
    this.listenerController?.abort();
    this.listenerController = null;
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
    this.initialized = false;
  }

  #cacheElements() {
    this.elements = {
      panel: document.getElementById(this.options.panelId),
      status: document.getElementById(this.options.statusElementId),
      statusLabel: document.getElementById(this.options.statusLabelId),
      timeInput: document.getElementById(this.options.timeInputId),
      shareUrl: document.getElementById(this.options.shareUrlInputId),
      copyButton: document.getElementById(this.options.copyButtonId),
      copyFeedback: document.getElementById(this.options.copyFeedbackId),
      closeButton: document.getElementById(this.options.closeButtonId),
      statusButtons: [],
    };

    if (this.elements.panel) {
      this.elements.statusButtons = [
        ...this.elements.panel.querySelectorAll('[data-admin-status]'),
      ];
    }
  }

  #resolveInitialState(params) {
    const stored = this.#readStoredState();
    let status = this.options.defaultStatus;
    let departureTime = this.options.defaultDepartureTime;

    if (stored) {
      if (VALID_STATUSES.includes(stored.status)) status = stored.status;
      if (typeof stored.departureTime === 'string') departureTime = stored.departureTime;
    }

    const statusParam = params.get('status');
    if (statusParam !== null) {
      const candidate = statusParam.trim().toLowerCase();
      if (VALID_STATUSES.includes(candidate)) status = candidate;
      else console.warn(`[AdminPanel] Status "${statusParam}" tidak dikenal, diabaikan.`);
    }

    const timeParam = params.get('jam');
    if (timeParam !== null) {
      if (TIME_PATTERN.test(timeParam)) departureTime = timeParam;
      else console.warn(`[AdminPanel] Jam "${timeParam}" tidak valid, diabaikan.`);
    }

    if (!VALID_STATUSES.includes(status)) status = 'available';
    if (departureTime && !TIME_PATTERN.test(departureTime)) departureTime = '';

    return { status, departureTime };
  }

  #applyState() {
    this.#applyStatus();
    this.#applyTime();
  }

  #applyStatus() {
    const label = STATUS_LABELS[this.state.status] ?? STATUS_LABELS.available;

    if (this.elements.status) {
      this.elements.status.dataset.status = this.state.status;
      this.elements.status.setAttribute('aria-label', `Status ketersediaan: ${label}`);
    }

    if (this.elements.statusLabel) {
      this.elements.statusLabel.textContent = label;
    }

    for (const button of this.elements.statusButtons) {
      const isActive = button.dataset.adminStatus === this.state.status;
      button.setAttribute('aria-pressed', String(isActive));
    }
  }

  #applyTime() {
    if (this.elements.timeInput) {
      this.elements.timeInput.value = this.state.departureTime;
    }
  }

  #renderShareUrl() {
    if (this.elements.shareUrl) {
      this.elements.shareUrl.value = this.buildShareUrl();
    }
  }

  #bindEvents() {
    this.listenerController?.abort();
    this.listenerController = new AbortController();
    const { signal } = this.listenerController;

    for (const button of this.elements.statusButtons) {
      button.addEventListener(
        'click',
        () => {
          try {
            this.setStatus(button.dataset.adminStatus);
          } catch (error) {
            this.#reportError(error);
          }
        },
        { signal }
      );
    }

    this.elements.timeInput?.addEventListener(
      'change',
      () => {
        try {
          this.setDepartureTime(this.elements.timeInput.value);
        } catch (error) {
          this.#reportError(error);
          this.#applyTime();
        }
      },
      { signal }
    );

    this.elements.copyButton?.addEventListener(
      'click',
      () => {
        void this.copyStatusMessage();
      },
      { signal }
    );

    this.elements.closeButton?.addEventListener('click', () => this.hidePanel(), { signal });
  }

  #showPanel() {
    if (!this.elements.panel) {
      console.warn(`[AdminPanel] Elemen #${this.options.panelId} tidak ditemukan.`);
      return;
    }

    this.elements.panel.hidden = false;
  }

  #syncUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('status', this.state.status);

      if (this.state.departureTime) url.searchParams.set('jam', this.state.departureTime);
      else url.searchParams.delete('jam');

      if (this.adminMode) url.searchParams.set('admin', '1');
      else url.searchParams.delete('admin');

      window.history.replaceState({}, '', url);
    } catch (error) {
      console.warn('[AdminPanel] Gagal memperbarui URL:', error);
    }
  }

  #readStoredState() {
    try {
      const raw = window.localStorage.getItem(this.options.storageKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('[AdminPanel] Gagal membaca status tersimpan:', error);
      return null;
    }
  }

  #persistState() {
    try {
      window.localStorage.setItem(this.options.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.warn('[AdminPanel] Gagal menyimpan status:', error);
    }
  }

  async #copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        console.warn('[AdminPanel] Clipboard API gagal, mencoba fallback:', error);
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    document.body.append(textarea);

    try {
      textarea.select();
      const copied = document.execCommand('copy');
      if (!copied) throw new Error('Clipboard tidak tersedia.');
    } finally {
      textarea.remove();
    }
  }

  #showFeedback(message, isError = false) {
    if (!this.elements.copyFeedback) return;

    this.elements.copyFeedback.textContent = message;
    this.elements.copyFeedback.dataset.state = isError ? 'error' : 'ok';

    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      if (!this.elements.copyFeedback) return;
      this.elements.copyFeedback.textContent = '';
      delete this.elements.copyFeedback.dataset.state;
    }, FEEDBACK_TIMEOUT_MS);
  }

  #notifyChange() {
    if (typeof this.options.onChange !== 'function') return;

    try {
      this.options.onChange(this.getState());
    } catch (error) {
      this.#reportError(error);
    }
  }

  #reportError(error) {
    if (typeof this.options.onError === 'function') {
      try {
        this.options.onError(error);
      } catch (callbackError) {
        console.error('[AdminPanel] Callback onError gagal:', callbackError);
      }
      return;
    }

    console.error('[AdminPanel]', error);
  }
}

/**
 * Convenience factory for the common "create and initialize" flow.
 * @param {ConstructorParameters<typeof AdminPanel>[0]} [options]
 * @returns {AdminPanel}
 */
export function initAdminPanel(options = {}) {
  return new AdminPanel(options).init();
}
