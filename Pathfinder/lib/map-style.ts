// Dark Pathfinder map style — base #0e1116 (Hi-Fi mapBg), muted geography,
// suppressed POI / transit / business labels, minimal road weight.
//
// References:
//   - Mapbox dark-v11 ("operator-grade dark")
//   - Google Maps Platform Styling Wizard (https://mapstyle.withgoogle.com/)
//
// Geometry tones step from `#0a0d12` (water) → `#1a1f26` (land) → `#222933`
// (administrative/highway accents) so the brightest features are still well
// below white on the value scale. Labels are kept legible at small sizes
// (#5a626d for mute, #c9cfd8 for emphasized labels) but never compete with
// the data layer.

import type { MapStyleSpec } from '@/lib/types-map';

export const PATHFINDER_DARK_STYLE: MapStyleSpec = [
  // Base geometry / labels
  { elementType: 'geometry', stylers: [{ color: '#1a1f26' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7a8392' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0e1116' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Water — slightly cooler than land so coastlines read at a glance
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0d12' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d4654' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0a0d12' }] },

  // Land / parks — kept to the same tone as base so projects + branches pop
  {
    featureType: 'landscape.natural',
    elementType: 'geometry',
    stylers: [{ color: '#1a1f26' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#1c2129' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#15191f' }],
  },

  // Suppress all POI labels and consumer business clutter
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.medical', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.school', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.government', stylers: [{ visibility: 'off' }] },

  // Transit — off
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'off' }] },

  // Roads — minimal weight, kept dark, only highways labeled
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#222933' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#11141a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#5a626d' }] },
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0e1116' }, { weight: 2 }],
  },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#1f242c' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#222933' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a313c' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0a0d12' }] },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#7a8392' }],
  },
  {
    featureType: 'road.highway.controlled_access',
    elementType: 'geometry',
    stylers: [{ color: '#2a313c' }],
  },

  // Administrative — keep country/state borders subtle but readable
  {
    featureType: 'administrative.country',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#3d4654' }, { weight: 1.1 }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#c9cfd8' }],
  },
  {
    featureType: 'administrative.province',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#2a313c' }, { weight: 0.6 }],
  },
  {
    featureType: 'administrative.province',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9aa3b2' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9aa3b2' }],
  },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
];
