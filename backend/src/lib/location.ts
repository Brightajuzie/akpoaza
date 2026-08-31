import axios from 'axios';
import http from 'http';
import prisma from './prisma';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export interface DistanceResult {
  distanceKm: number;
  durationMins?: number;
  routeType: 'google' | 'osrm' | 'straight-line';
  provider: string;
}

export interface LocationCoordinates {
  lat: number;
  lng: number;
  formattedAddress?: string;
}

/**
 * Haversine formula for straight-line distance on Earth's surface (km)
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetch high-accuracy driving distance and duration from Google Maps Distance Matrix API
 */
async function getGoogleMapsDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<DistanceResult | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&mode=driving&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await axios.get(url, { timeout: 6000 });

    if (response.data?.status === 'OK') {
      const element = response.data?.rows?.[0]?.elements?.[0];
      if (element && element.status === 'OK') {
        const distanceKm = element.distance.value / 1000; // meters -> km
        const durationSec = element.duration_in_traffic?.value || element.duration?.value || 0;
        const durationMins = Math.ceil(durationSec / 60);

        return {
          distanceKm: Math.round(distanceKm * 100) / 100,
          durationMins,
          routeType: 'google',
          provider: 'Google Maps Distance Matrix API',
        };
      }
    }
  } catch (error: any) {
    console.warn(`[LocationService] Google Maps Distance Matrix API error: ${error?.message || error}`);
  }
  return null;
}

/**
 * Fetch real road distance from OSRM (Open Source Routing Machine) API
 */
function getOsrmDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<DistanceResult | null> {
  return new Promise((resolve) => {
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false&annotations=false`;
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
            const route = json.routes[0];
            resolve({
              distanceKm: Math.round((route.distance / 1000) * 100) / 100,
              durationMins: Math.ceil(route.duration / 60),
              routeType: 'osrm',
              provider: 'OSRM Road Routing Engine',
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * High-accuracy multi-tier Distance Calculator
 * Priority: 1) Google Maps Distance Matrix API -> 2) OSRM Road Distance -> 3) Haversine * 1.3 Winding Factor
 */
export async function calculateAccurateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<DistanceResult> {
  // Tier 1: Google Maps Distance Matrix API
  const googleResult = await getGoogleMapsDistance(lat1, lon1, lat2, lon2);
  if (googleResult) return googleResult;

  // Tier 2: OSRM Real Road Engine
  const osrmResult = await getOsrmDistance(lat1, lon1, lat2, lon2);
  if (osrmResult) return osrmResult;

  // Tier 3: Haversine with 1.3 road curvature factor
  const straight = haversineDistanceKm(lat1, lon1, lat2, lon2);
  const estimatedKm = Math.round(straight * 1.3 * 100) / 100;
  return {
    distanceKm: estimatedKm,
    durationMins: Math.ceil(estimatedKm * 3), // ~3 mins per km estimate
    routeType: 'straight-line',
    provider: 'Haversine Winding Algorithm',
  };
}

/**
 * Google Maps Geocoding API — converts address string to lat/lng coordinates
 */
export async function geocodeAddress(address: string): Promise<LocationCoordinates | null> {
  if (!address || !address.trim()) return null;

  if (GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await axios.get(url, { timeout: 5000 });

      if (res.data?.status === 'OK' && res.data.results?.length > 0) {
        const result = res.data.results[0];
        const location = result.geometry.location;
        return {
          lat: location.lat,
          lng: location.lng,
          formattedAddress: result.formatted_address,
        };
      }
    } catch (err: any) {
      console.warn(`[LocationService] Google Geocoding API error: ${err?.message}`);
    }
  }
  return null;
}

/**
 * Google Maps Geolocation API — resolves device position via cell towers or Wi-Fi APs
 */
export async function geolocateDevice(): Promise<LocationCoordinates | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = `https://www.googleapis.com/geolocation/v1/geolocate?key=${GOOGLE_MAPS_API_KEY}`;
    const res = await axios.post(url, {}, { timeout: 5000 });

    if (res.data?.location) {
      return {
        lat: res.data.location.lat,
        lng: res.data.location.lng,
      };
    }
  } catch (err: any) {
    console.warn(`[LocationService] Google Geolocation API error: ${err?.message}`);
  }
  return null;
}

/**
 * Delivery Pricing Calculator integrating Admin rates & Google Maps / OSRM distance
 */
export async function calculateRiderDeliveryPrice(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number
) {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ['rider_base_fare', 'rider_price_per_km', 'rider_platform_fee_pct'] } }
  });
  const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const BASE_FARE = parseFloat(settingsMap['rider_base_fare'] || '1000');
  const PER_KM_RATE = parseFloat(settingsMap['rider_price_per_km'] || '200');
  const PLATFORM_FEE_PCT = parseFloat(settingsMap['rider_platform_fee_pct'] || '10');

  const distanceResult = await calculateAccurateDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const subTotal = BASE_FARE + (distanceResult.distanceKm * PER_KM_RATE);
  const platformFee = subTotal * (PLATFORM_FEE_PCT / 100);

  return {
    price: Math.ceil(subTotal + platformFee),
    distanceKm: distanceResult.distanceKm.toFixed(2),
    durationMins: distanceResult.durationMins ?? null,
    routeType: distanceResult.routeType,
    provider: distanceResult.provider,
    BASE_FARE,
    PER_KM_RATE,
    PLATFORM_FEE_PCT,
  };
}
