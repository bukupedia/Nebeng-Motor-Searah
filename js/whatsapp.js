/**
 * WhatsApp checkout helpers.
 * Builds human-readable booking messages and encodes them into wa.me links.
 */

const WA_BASE_URL = 'https://wa.me';

const SERVICE_BONCENGAN = 'boncengan';
const SERVICE_PAKET = 'paket';

const HELMET_LABELS = {
  own: 'Bawa helm sendiri',
  spare: 'Pinjam helm cadangan',
  none: 'Tidak perlu helm',
};

const LUGGAGE_LABELS = {
  none: 'Tanpa barang bawaan',
  backpack: 'Tas ransel (dipakai di punggung)',
  'small-bag': 'Tas kecil / kantong belanja',
};

const PACKAGE_SIZE_LABELS = {
  document: 'Dokumen / amplop',
  small: 'Paket kecil (< 2 kg)',
  medium: 'Paket sedang (2–5 kg)',
  large: 'Paket besar (5–10 kg)',
};

const MAX_PACKAGE_WEIGHT_KG = 10;

function normalizeServiceType(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (['boncengan', 'ride', 'ride-sharing', 'motorcycle'].includes(normalized)) {
    return SERVICE_BONCENGAN;
  }

  if (['paket', 'package', 'delivery', 'package-delivery'].includes(normalized)) {
    return SERVICE_PAKET;
  }

  throw new Error('serviceType harus "boncengan" atau "paket".');
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} wajib diisi.`);
  return text;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function formatRupiah(value) {
  if (value === null || value === undefined || value === '') return null;

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Nominal kontribusi tidak valid.');
  }

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function hasCoordinates(pickup) {
  if (!pickup || typeof pickup !== 'object') return false;
  const lat = Number(pickup.lat);
  const lng = Number(pickup.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function mapsLink(pickup) {
  if (!hasCoordinates(pickup)) {
    throw new Error('Koordinat titik jemput tidak valid.');
  }

  return `https://www.google.com/maps/search/?api=1&query=${Number(pickup.lat)},${Number(
    pickup.lng
  )}`;
}

function addOptionalLine(lines, label, value) {
  const text = optionalText(value);
  if (text) lines.push(`*${label}:* ${text}`);
}

function greetingName(value) {
  return optionalText(value) ?? 'Kak';
}

/**
 * Normalize an Indonesian phone number into the 62-prefixed wa.me format.
 * @param {string} phoneNumber
 * @returns {string}
 */
export function normalizePhoneNumber(phoneNumber) {
  const raw = String(phoneNumber ?? '').trim();
  if (!raw) throw new Error('Nomor WhatsApp wajib diisi.');

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;

  if (!/^62\d{8,15}$/.test(digits)) {
    throw new Error('Nomor WhatsApp tidak valid. Gunakan format 62xxxxxxxxxx.');
  }

  return digits;
}

function buildRideMessage(data) {
  const passengerName = requireText(data.passengerName, 'Nama penumpang');
  const routeName = requireText(data.routeName, 'Rute');
  const pickupLink = mapsLink(data.pickup);

  const lines = [
    `Halo ${greetingName(data.riderName)}! Saya mau nebeng motor.`,
    '',
    '*Layanan:* Boncengan motor',
    `*Nama:* ${passengerName}`,
  ];

  addOptionalLine(lines, 'Sosial media', data.socialMedia);
  lines.push(`*Rute:* ${routeName}`);
  addOptionalLine(lines, 'Jam berangkat', data.departureTime);
  addOptionalLine(lines, 'Titik temu', data.meetingPoint);
  addOptionalLine(lines, 'Patokan jemput', data.pickupLandmark);
  lines.push(`*Lokasi jemput:* ${pickupLink}`);

  const helmetLabel = HELMET_LABELS[data.helmet] ?? HELMET_LABELS.own;
  const helmetSize =
    data.helmet === 'spare' && optionalText(data.helmetSize)
      ? ` (ukuran ${optionalText(data.helmetSize)})`
      : '';
  lines.push(`*Helm:* ${helmetLabel}${helmetSize}`);
  lines.push(`*Barang bawaan:* ${LUGGAGE_LABELS[data.luggage] ?? LUGGAGE_LABELS.none}`);

  const contribution = formatRupiah(data.contribution ?? data.baseContribution ?? data.fee);
  if (contribution) lines.push(`*Kontribusi bensin:* ${contribution}`);

  lines.push('', 'Mohon konfirmasi ketersediaannya. Terima kasih!');
  return lines.join('\n');
}

function buildPackageMessage(data) {
  const senderName = optionalText(data.senderName ?? data.passengerName);
  const recipientName = requireText(data.recipientName, 'Nama penerima');
  const recipientPhone = requireText(data.recipientPhone, 'WhatsApp penerima');
  const routeName = requireText(data.routeName, 'Rute');
  const handoverLocation = requireText(
    data.handoverLocation ?? data.pickupLandmark ?? data.meetingPoint,
    'Lokasi serah paket'
  );

  if (!/^[0-9+()\s-]{8,20}$/.test(recipientPhone)) {
    throw new Error('Nomor WhatsApp penerima tidak valid.');
  }

  const packageSize =
    PACKAGE_SIZE_LABELS[data.packageSize] ??
    optionalText(data.packageSize) ??
    'Paket (maks. 10 kg)';

  const lines = [
    `Halo ${greetingName(data.riderName)}! Saya mau titip paket searah.`,
    '',
    '*Layanan:* Titip paket searah',
  ];

  if (senderName) lines.push(`*Pengirim:* ${senderName}`);
  addOptionalLine(lines, 'Sosial media', data.socialMedia);
  lines.push(`*Rute:* ${routeName}`);
  addOptionalLine(lines, 'Jam berangkat', data.departureTime);
  lines.push(`*Lokasi serah:* ${handoverLocation}`);

  if (hasCoordinates(data.pickup)) {
    lines.push(`*Lokasi di peta:* ${mapsLink(data.pickup)}`);
  }

  lines.push(`*Penerima:* ${recipientName}`);
  lines.push(`*WhatsApp penerima:* ${recipientPhone}`);
  lines.push(`*Ukuran paket:* ${packageSize}`);
  addOptionalLine(lines, 'Isi paket', data.packageDescription);
  lines.push(`*Batas berat:* maks. ${MAX_PACKAGE_WEIGHT_KG} kg`);

  const fee = formatRupiah(data.fee ?? data.deliveryFee ?? data.contribution);
  if (fee) lines.push(`*Biaya titip:* ${fee}`);

  lines.push('', 'Mohon konfirmasi bila paket muat dan searah. Terima kasih!');
  return lines.join('\n');
}

/**
 * Build the plain-text WhatsApp message for a booking.
 * @param {Object} bookingData
 * @param {'boncengan'|'paket'} bookingData.serviceType
 * @returns {string}
 */
export function buildBookingMessage(bookingData = {}) {
  try {
    const serviceType = normalizeServiceType(bookingData.serviceType);
    return serviceType === SERVICE_PAKET
      ? buildPackageMessage(bookingData)
      : buildRideMessage(bookingData);
  } catch (error) {
    console.error('[WhatsApp] Gagal menyusun pesan:', error);
    throw error;
  }
}

/**
 * Build a wa.me checkout URL with an encoded booking message.
 * @param {string} phoneNumber Rider phone number in local or international format.
 * @param {Object} bookingData
 * @returns {string}
 */
export function buildWhatsAppUrl(phoneNumber, bookingData) {
  try {
    const phone = normalizePhoneNumber(phoneNumber);
    const message = buildBookingMessage(bookingData);
    return `${WA_BASE_URL}/${phone}?text=${encodeURIComponent(message)}`;
  } catch (error) {
    console.error('[WhatsApp] Gagal membuat tautan WhatsApp:', error);
    throw error;
  }
}
