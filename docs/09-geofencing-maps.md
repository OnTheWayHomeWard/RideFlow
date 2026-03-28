# 09 — Geofencing & Maps

## Overview
Geofencing restricts bookings to your service area. Maps integration handles address autocomplete, distance calculation, and location tracking.

---

## Geofence

### Purpose
- Prevent bookings outside your service area
- Show clear boundaries to clients
- Different geofences for different service levels (future)

### Implementation

```javascript
// Define service area as a polygon (array of lat/lng points)
const serviceArea = [
  { lat: 25.80, lng: -80.35 },
  { lat: 25.80, lng: -80.10 },
  { lat: 25.65, lng: -80.10 },
  { lat: 25.65, lng: -80.35 },
];

// Check if a point is inside the polygon (ray casting algorithm)
function isInsideGeofence(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > point.lng) !== (yj > point.lng))
      && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
```

### User Experience
When a client enters an address outside the geofence:
```
"Sorry, we currently don't serve this location.
We operate within the [City Name] metro area.
Call us at (555) 000-0000 for special requests."
```

### Admin Configuration
Admin can draw/edit the geofence on a map in the dashboard (using Google Maps drawing tools or by entering coordinates).

---

## Google Maps Integration

### APIs Used

| API | Purpose | Cost |
|-----|---------|------|
| Places Autocomplete | Address search as user types | $2.83/1000 |
| Distance Matrix | Calculate driving distance & duration | $5/1000 |
| Geocoding | Convert address to lat/lng | $5/1000 |
| Maps JavaScript | Display maps in admin dashboard | $7/1000 loads |

### Address Autocomplete

```javascript
// Google Places Autocomplete on the booking form
const autocomplete = new google.maps.places.Autocomplete(inputElement, {
  types: ['address'],
  componentRestrictions: { country: 'us' },
  bounds: serviceAreaBounds,  // bias results to our area
});

autocomplete.addListener('place_changed', () => {
  const place = autocomplete.getPlace();
  const location = {
    address: place.formatted_address,
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng(),
  };
  // Validate against geofence
  if (!isInsideGeofence(location, serviceArea)) {
    showError("This location is outside our service area");
  }
});
```

### Distance Calculation

```javascript
// Server-side distance calculation
const { Client } = require("@googlemaps/google-maps-services-js");
const mapsClient = new Client({});

async function getDistance(origin, destination) {
  const response = await mapsClient.distancematrix({
    params: {
      origins: [`${origin.lat},${origin.lng}`],
      destinations: [`${destination.lat},${destination.lng}`],
      mode: 'driving',
      key: GOOGLE_MAPS_API_KEY,
    },
  });

  const result = response.data.rows[0].elements[0];
  return {
    distance_miles: result.distance.value / 1609.34,  // meters to miles
    duration_minutes: result.duration.value / 60,
  };
}
```

### Cost Optimization
- **Cache common route distances** — don't recalculate Airport→Downtown every time
- **Use fixed prices for common routes** — skip distance API entirely
- **Batch requests** — if calculating multiple route options
- Estimated cost: ~$15-30/month for 1000 bookings/month

---

## Location Recording

When drivers start/complete rides, record GPS:

```javascript
// Get driver's current location (browser Geolocation API)
navigator.geolocation.getCurrentPosition((position) => {
  const location = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: new Date().toISOString(),
  };
  // Send to API
  api.post(`/rides/${rideId}/location`, { event: 'start', location });
});
```

This is stored in the booking's `start_location` and `end_location` fields for:
- Verifying the driver went to the right places
- Dispute resolution
- Analytics (actual vs planned routes)
