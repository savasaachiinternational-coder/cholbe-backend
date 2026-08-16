import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GeocodeComponent = { long_name: string; types: string[] };

export type ReverseGeocodeResult = {
  formattedAddress: string;
  components: GeocodeComponent[];
};

type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{
    formatted_address: string;
    address_components: GeocodeComponent[];
  }>;
};

const STATIC_MAP_MAX_DIMENSION = 1280;

@Injectable()
export class MapsService {
  constructor(private config: ConfigService) {}

  /**
   * Server-side Maps key. Kept out of the mobile bundle so it can be locked to
   * this server's IP in Google Cloud Console.
   */
  private apiKey() {
    const key = this.config.get<string>('GOOGLE_MAPS_SERVER_API_KEY');
    if (!key) {
      throw new ServiceUnavailableException(
        'Maps service is not configured on the server',
      );
    }
    return key;
  }

  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<ReverseGeocodeResult | null> {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?latlng=${lat},${lng}&key=${this.apiKey()}`;

    let data: GoogleGeocodeResponse;
    try {
      const response = await fetch(url);
      data = (await response.json()) as GoogleGeocodeResponse;
    } catch {
      throw new ServiceUnavailableException('Geocoding provider unreachable');
    }

    if (data.status !== 'OK' || !data.results?.length) {
      return null;
    }

    const [first] = data.results;
    return {
      formattedAddress: first.formatted_address,
      components: first.address_components,
    };
  }

  async staticMap(params: {
    lat: number;
    lng: number;
    zoom: number;
    width: number;
    height: number;
    scale: number;
  }): Promise<{ body: Buffer; contentType: string }> {
    const width = this.clamp(params.width, 1, STATIC_MAP_MAX_DIMENSION);
    const height = this.clamp(params.height, 1, STATIC_MAP_MAX_DIMENSION);
    const zoom = this.clamp(params.zoom, 1, 21);
    const scale = params.scale === 2 ? 2 : 1;
    const center = `${params.lat},${params.lng}`;

    const url =
      'https://maps.googleapis.com/maps/api/staticmap' +
      `?center=${center}&zoom=${zoom}&size=${width}x${height}&scale=${scale}` +
      `&markers=${encodeURIComponent(`color:red|${center}`)}` +
      `&key=${this.apiKey()}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new ServiceUnavailableException('Static map provider unreachable');
    }

    if (!response.ok) {
      throw new InternalServerErrorException('Could not render map preview');
    }

    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'image/png',
    };
  }

  private clamp(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(Math.round(value), min), max);
  }
}
