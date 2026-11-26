/**
 * Single source of truth for rider details and daily routes.
 */

/**
 * @typedef {Object} Place
 * @property {string} name - Human readable meeting point.
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} Route
 * @property {string} id
 * @property {'morning'|'evening'} period
 * @property {string} name
 * @property {string} departureTime - 24-hour HH:MM in Asia/Jakarta.
 * @property {number} baseContribution - Suggested fuel contribution in IDR.
 * @property {Place} startPoint
 * @property {Place} endPoint
 * @property {Place[]} waypoints - Meeting points along the route, in travel order.
 */

export const RIDER_CONFIG = {
  name: 'Rizky Pratama',
  whatsappNumber: '62895332782122',
  motorcycle: {
    type: 'Honda Vario 160',
    color: 'Hitam Doff',
  },
  licensePlate: 'B 41•• KQ',
  spareHelmet: false,
  maxDetourKm: 5,
  homeBase: 'Meruya Selatan, Jakarta Barat',
  operatingDays: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'],
};

/** @type {Route[]} */
export const ROUTES = [
  {
    id: 'morning-meruya-sudirman',
    period: 'morning',
    name: 'Pagi · Meruya Selatan → Sudirman',
    departureTime: '06:15',
    baseContribution: 12000,
    startPoint: {
      name: 'Meruya Selatan, Jakarta Barat',
      lat: -6.2036,
      lng: 106.7296,
    },
    endPoint: {
      name: 'SCBD, Jl. Jend. Sudirman',
      lat: -6.2245,
      lng: 106.809,
    },
    waypoints: [
      { name: 'Meruya Ilir · Halte TransJakarta', lat: -6.1907, lng: 106.7451 },
      { name: 'Kebon Jeruk · Jl. Raya Kebon Jeruk', lat: -6.1936, lng: 106.7702 },
      { name: 'Tanjung Duren · Jl. Tanjung Duren Raya', lat: -6.1757, lng: 106.7897 },
      { name: 'Slipi · Jl. Letjen S. Parman', lat: -6.1901, lng: 106.7998 },
      { name: 'Semanggi · Jl. Jend. Sudirman', lat: -6.2185, lng: 106.8143 },
    ],
  },
  {
    id: 'evening-sudirman-meruya',
    period: 'evening',
    name: 'Sore · Sudirman → Meruya Selatan',
    departureTime: '17:30',
    baseContribution: 12000,
    startPoint: {
      name: 'SCBD, Jl. Jend. Sudirman',
      lat: -6.2245,
      lng: 106.809,
    },
    endPoint: {
      name: 'Meruya Selatan, Jakarta Barat',
      lat: -6.2036,
      lng: 106.7296,
    },
    waypoints: [
      { name: 'Semanggi · Jl. Jend. Sudirman', lat: -6.2185, lng: 106.8143 },
      { name: 'Slipi · Jl. Letjen S. Parman', lat: -6.1901, lng: 106.7998 },
      { name: 'Tanjung Duren · Jl. Tanjung Duren Raya', lat: -6.1757, lng: 106.7897 },
      { name: 'Kebon Jeruk · Jl. Raya Kebon Jeruk', lat: -6.1936, lng: 106.7702 },
      { name: 'Meruya Ilir · Halte TransJakarta', lat: -6.1907, lng: 106.7451 },
    ],
  },
];
