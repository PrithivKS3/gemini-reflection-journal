import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { JournalLocation } from '../models/journal.models';

export interface MapsConfigResponse {
  apiKey: string;
  attributionId: string;
  status: string;
}

export const POPULAR_LOCATION_PRESETS: JournalLocation[] = [
  {
    name: 'Central Park',
    address: 'New York, NY 10024, USA',
    latitude: 40.785091,
    longitude: -73.968285,
  },
  {
    name: 'Kyoto Bamboo Grove',
    address: 'Arashiyama, Ukyo Ward, Kyoto, Japan',
    latitude: 35.016972,
    longitude: 135.671278,
  },
  {
    name: 'Golden Gate Park',
    address: 'San Francisco, CA 94122, USA',
    latitude: 37.769421,
    longitude: -122.486214,
  },
  {
    name: 'Hyde Park',
    address: 'London W2 2UH, United Kingdom',
    latitude: 51.507268,
    longitude: -0.16573,
  },
  {
    name: 'Mount Fuji Vista',
    address: 'Kitayama, Fujinomiya, Shizuoka, Japan',
    latitude: 35.360556,
    longitude: 138.727778,
  },
  {
    name: 'Paris Seine Riverbank',
    address: 'Quai de la Tournelle, 75005 Paris, France',
    latitude: 48.8504,
    longitude: 2.3533,
  },
];

@Injectable({
  providedIn: 'root',
})
export class MapsService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly isMapsLoaded = signal<boolean>(false);
  readonly isLoadingMaps = signal<boolean>(false);
  readonly mapsError = signal<string | null>(null);

  private loaderPromise: Promise<boolean> | null = null;
  private apiKey: string | null = null;

  /**
   * Loads the Google Maps JavaScript API with proper attribution ID.
   */
  async loadGoogleMaps(): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    if (this.isMapsLoaded()) {
      return true;
    }

    if (this.loaderPromise) {
      return this.loaderPromise;
    }

    this.isLoadingMaps.set(true);
    this.mapsError.set(null);

    this.loaderPromise = (async () => {
      try {
        let key = 'AIzaSyA6myHzS10YXdcazAFalmXvDkrYCp5cLc8'; // Default demo key
        try {
          const res = await fetch('/api/maps/config');
          if (res.ok) {
            const data: MapsConfigResponse = await res.json();
            if (data.apiKey) {
              key = data.apiKey;
            }
          }
        } catch {
          // Gracefully fallback to default demo key
        }

        this.apiKey = key;

        setOptions({
          key: this.apiKey,
          v: 'weekly',
          solutionChannel: 'gmp_mcp_codeassist_v1_aistudio',
        });

        // Preload core libraries
        await importLibrary('maps');
        await importLibrary('geocoding');

        this.isMapsLoaded.set(true);
        return true;
      } catch (err: unknown) {
        console.error('Google Maps loader failed:', err);
        const msg = err instanceof Error ? err.message : 'Failed to load Google Maps.';
        this.mapsError.set(msg);
        return false;
      } finally {
        this.isLoadingMaps.set(false);
      }
    })();

    return this.loaderPromise;
  }

  /**
   * Retrieves current device GPS coordinates with defensive permission and timeout handling.
   */
  async getCurrentCoordinates(): Promise<{ latitude: number; longitude: number }> {
    if (!isPlatformBrowser(this.platformId) || !navigator.geolocation) {
      throw new Error('Geolocation is not supported by your browser.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        (err) => {
          let errorMsg = 'Could not access device location.';
          if (err.code === err.PERMISSION_DENIED) {
            errorMsg = 'Location permission was denied. Please allow location access or select a preset location.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorMsg = 'Location information is currently unavailable.';
          } else if (err.code === err.TIMEOUT) {
            errorMsg = 'Location request timed out.';
          }
          reject(new Error(errorMsg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        },
      );
    });
  }

  /**
   * Reverse geocodes coordinates to a human-readable location address and returns a JournalLocation.
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<JournalLocation> {
    try {
      const loaded = await this.loadGoogleMaps();
      if (loaded) {
        const geocodingLib = (await importLibrary('geocoding')) as google.maps.GeocodingLibrary;
        const geocoder = new geocodingLib.Geocoder();
        const response = await geocoder.geocode({
          location: { lat: latitude, lng: longitude },
        });

        if (response.results && response.results.length > 0) {
          const best = response.results[0];
          const localityComponent = best.address_components.find((c: google.maps.GeocoderAddressComponent) =>
            c.types.includes('locality') || c.types.includes('sublocality') || c.types.includes('point_of_interest'),
          );
          const name = localityComponent ? localityComponent.long_name : best.formatted_address.split(',')[0];
          return {
            name: name || 'Pinned Location',
            address: best.formatted_address,
            latitude,
            longitude,
            placeId: best.place_id,
          };
        }
      }
    } catch (err) {
      console.warn('Client geocoding fallback to coords:', err);
    }

    const latStr = latitude.toFixed(3);
    const lngStr = longitude.toFixed(3);
    return {
      name: `Location (${latStr}, ${lngStr})`,
      address: `Latitude: ${latStr}, Longitude: ${lngStr}`,
      latitude,
      longitude,
    };
  }

  /**
   * Forward geocodes a location query or address string into candidate locations.
   */
  async searchLocation(query: string): Promise<JournalLocation[]> {
    if (!query || !query.trim()) return [];

    try {
      const loaded = await this.loadGoogleMaps();
      if (loaded) {
        const geocodingLib = (await importLibrary('geocoding')) as google.maps.GeocodingLibrary;
        const geocoder = new geocodingLib.Geocoder();
        const response = await geocoder.geocode({ address: query.trim() });
        if (response.results && response.results.length > 0) {
          return response.results.slice(0, 5).map((res) => {
            const loc = res.geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
            const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
            const shortName = res.address_components[0]?.long_name || query.trim();
            return {
              name: shortName,
              address: res.formatted_address,
              latitude: lat,
              longitude: lng,
              placeId: res.place_id,
            };
          });
        }
      }
    } catch (err) {
      console.warn('Geocoding search fallback to presets:', err);
    }

    // Preset lookup fallback
    const lower = query.trim().toLowerCase();
    const matched = POPULAR_LOCATION_PRESETS.filter(
      (p) => p.name.toLowerCase().includes(lower) || (p.address && p.address.toLowerCase().includes(lower)),
    );
    if (matched.length > 0) {
      return matched;
    }

    return [];
  }
}
