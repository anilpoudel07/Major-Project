/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  
  return distance;
};

/**
 * Convert degrees to radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Calculate fare based on distance
 */
export const calculateFare = (distanceKm, ratePerKm = 10) => {
  // Minimum fare for short distances
  const minimumFare = 10; // Minimum 15 NPR
  
  if (distanceKm <= 0) {
    return minimumFare;
  }
  
  // Round up to nearest 0.1 km for fare calculation
  const roundedDistance = Math.ceil(distanceKm * 10) / 10;
  const calculatedFare = roundedDistance * ratePerKm;
  
  return Math.max(calculatedFare, minimumFare);
};

