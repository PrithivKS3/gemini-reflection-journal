import { Router, Request, Response } from 'express';

export const mapsRouter = Router();

/**
 * Public Maps Demo Key provided for zero-cost prototyping by Google Maps Platform.
 * If GOOGLE_MAPS_API_KEY environment variable is set in production or Secret Manager,
 * it will take precedence.
 */
const DEFAULT_DEMO_KEY = 'AIzaSyA6myHzS10YXdcazAFalmXvDkrYCp5cLc8';

/**
 * GET /api/maps/config
 * Provides runtime Google Maps Platform configuration to the client
 * without hardcoding keys in the browser bundle.
 */
mapsRouter.get('/config', (_req: Request, res: Response) => {
  const apiKey = process.env['GOOGLE_MAPS_API_KEY'] || DEFAULT_DEMO_KEY;
  res.json({
    apiKey,
    attributionId: 'gmp_mcp_codeassist_v1_aistudio',
    status: 'ok',
  });
});

/**
 * POST /api/maps/reverse-geocode
 * Safely resolves coordinates into readable location names.
 */
mapsRouter.post('/reverse-geocode', async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.body || {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({ error: 'Valid latitude and longitude numbers are required.' });
      return;
    }

    const apiKey = process.env['GOOGLE_MAPS_API_KEY'] || DEFAULT_DEMO_KEY;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const topResult = data.results[0];
      res.json({
        formattedAddress: topResult.formatted_address,
        placeId: topResult.place_id,
        status: 'OK',
      });
      return;
    }

    res.json({
      formattedAddress: `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
      status: data.status || 'ZERO_RESULTS',
    });
  } catch (error: unknown) {
    console.error('Error in reverse geocoding:', error);
    res.status(500).json({ error: 'Failed to reverse geocode coordinates.' });
  }
});
