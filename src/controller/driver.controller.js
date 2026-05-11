import { asyncHandler } from "../utils/asyncHandler.js";
import { Driver } from "../model/driver.model.js";
import { Bus } from "../model/vechile.model.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/**
 * GET /api/v1/users/driver/my-bus
 *
 * Returns the bus assigned to the currently logged-in driver,
 * including its current GPS location, status, and occupancy.
 * The driver dashboard polls this every 5 s to keep the map pin fresh.
 *
 * If the driver has updated the bus location via PATCH /vehicle/:busId/location,
 * that value is what gets returned here.
 */
const getMyBus = asyncHandler(async (req, res) => {
  // Find the driver profile linked to this user account
  const driver = await Driver.findOne({ user: req.user._id });
  if (!driver) throw new ApiError(404, "Driver profile not found");

  if (!driver.assignedBus)
    throw new ApiError(404, "You do not have a bus assigned to you yet");

  const bus = await Bus.findById(driver.assignedBus)
    .select(
      "plateNumber busType status currentLocation lastSeen currentOccupancy maxCapacity operator"
    )
    .populate("operator", "companyName contact.phone");

  if (!bus) throw new ApiError(404, "Assigned bus not found");

  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const locationFresh = bus.currentLocation?.timestamp
    ? Date.now() - new Date(bus.currentLocation.timestamp).getTime() < STALE_THRESHOLD_MS
    : false;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        bus: {
          _id:              bus._id,
          plateNumber:      bus.plateNumber,
          busType:          bus.busType,
          status:           bus.status,
          currentLocation:  bus.currentLocation,
          lastSeen:         bus.lastSeen,
          currentOccupancy: bus.currentOccupancy,
          maxCapacity:      bus.maxCapacity,
          operator:         bus.operator,
          locationFresh,
        },
      },
      "Bus details fetched successfully"
    )
  );
});

/**
 * PATCH /api/v1/users/driver/my-bus/location
 *
 * Convenience endpoint so the driver app only needs to know ONE URL
 * to push GPS updates — no need to know the busId in advance.
 *
 * Body: { lat: Number, lng: Number }
 *
 * The ESP / mobile app sends location every few seconds while the
 * driver is on duty. We update Bus.currentLocation and Bus.lastSeen.
 */
const updateMyBusLocation = asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;

  if (lat === undefined || lng === undefined)
    throw new ApiError(400, "lat and lng are required");
  if (typeof lat !== "number" || typeof lng !== "number")
    throw new ApiError(400, "lat and lng must be numbers");
  if (lat < -90 || lat > 90)
    throw new ApiError(400, "lat must be between -90 and 90");
  if (lng < -180 || lng > 180)
    throw new ApiError(400, "lng must be between -180 and 180");

  const driver = await Driver.findOne({ user: req.user._id });
  if (!driver) throw new ApiError(404, "Driver profile not found");
  if (!driver.assignedBus)
    throw new ApiError(400, "You do not have a bus assigned — cannot update location");

  const bus = await Bus.findById(driver.assignedBus);
  if (!bus) throw new ApiError(404, "Assigned bus not found");

  bus.currentLocation = { lat, lng, timestamp: new Date() };
  bus.lastSeen = new Date();
  await bus.save({ validateBeforeSave: false });

  return res.status(200).json(
    new ApiResponse(
      200,
      { _id: bus._id, currentLocation: bus.currentLocation },
      "Bus location updated successfully"
    )
  );
});

export { getMyBus, updateMyBusLocation };
