import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../model/user.model.js";
import { Operator } from "../model/operator.model.js";
import { Driver } from "../model/driver.model.js";
import { Bus } from "../model/vechile.model.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// ── Private helpers ──────────────────────────────────────────────────────────

const getOperatorDoc = async (userId) => {
  const operatorDoc = await Operator.findOne({ owner: userId });
  if (!operatorDoc)
    throw new ApiError(403, "No operator profile found for your account");
  return operatorDoc;
};

const verifyBusOwnership = (bus, operatorDoc) => {
  if (String(bus.operator) !== String(operatorDoc._id))
    throw new ApiError(403, "This vehicle does not belong to your operator account");
};

const verifyDriverOwnership = (driver, operatorDoc) => {
  if (String(driver.operator) !== String(operatorDoc._id))
    throw new ApiError(403, "This driver does not belong to your operator account");
};

// ── PROFILE ──────────────────────────────────────────────────────────────────

// GET /api/v1/operator/profile
const getOperatorProfile = asyncHandler(async (req, res) => {
  const operatorDoc = await Operator.findOne({ owner: req.user._id })
    .populate("buses", "plateNumber busType status driver currentOccupancy maxCapacity")
    .populate({
      path: "drivers",
      populate: { path: "user", select: "FirstName email phone" },
    });

  if (!operatorDoc) throw new ApiError(404, "Operator profile not found");

  return res
    .status(200)
    .json(new ApiResponse(200, { user: req.user, operator: operatorDoc }, "Profile fetched successfully"));
});

// ── LIVE MAP ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/operator/buses/live
 *
 * Returns all buses belonging to this operator with their latest GPS location,
 * status, assigned driver, and when the location was last updated.
 *
 * The frontend polls this endpoint (e.g. every 5 s) to render a live map.
 * Buses whose lastSeen is older than 5 minutes are still returned so the map
 * can show them as "stale" / offline — the frontend can decide how to display them.
 */
const getLiveBuses = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);

  const buses = await Bus.find({ operator: operatorDoc._id })
    .select("plateNumber busType status currentLocation lastSeen driver currentOccupancy maxCapacity")
    .populate({
      path: "driver",
      select: "licenseNumber status",
      populate: { path: "user", select: "FirstName phone" },
    })
    .lean();

  // Tag each bus so the frontend knows if the location data is fresh
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const tagged = buses.map((b) => ({
    ...b,
    locationFresh:
      b.currentLocation?.timestamp
        ? now - new Date(b.currentLocation.timestamp).getTime() < STALE_THRESHOLD_MS
        : false,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, { total: tagged.length, buses: tagged }, "Live bus locations fetched"));
});

// ── VEHICLE (BUS) MANAGEMENT ─────────────────────────────────────────────────

// POST /api/v1/operator/vehicle/register
// Body: { plateNumber, busType?, maxCapacity }
const registerVehicle = asyncHandler(async (req, res) => {
  const { plateNumber, busType, maxCapacity } = req.body;

  if (!plateNumber?.trim()) throw new ApiError(400, "Plate number is required");
  if (!maxCapacity || maxCapacity < 1) throw new ApiError(400, "Valid max capacity is required");

  const operatorDoc = await getOperatorDoc(req.user._id);

  const existingBus = await Bus.findOne({ plateNumber: plateNumber.toUpperCase() });
  if (existingBus) throw new ApiError(409, "A vehicle with this plate number already exists");

  const bus = await Bus.create({
    plateNumber,
    busType: busType || "standard",
    maxCapacity,
    operator: operatorDoc._id,
    driver: null,
  });

  await Operator.findByIdAndUpdate(operatorDoc._id, {
    $push: { buses: bus._id },
    $inc: { totalBuses: 1 },
  });

  const populatedBus = await Bus.findById(bus._id)
    .populate("operator", "companyName contact.phone");

  return res
    .status(201)
    .json(new ApiResponse(201, populatedBus, "Vehicle registered successfully"));
});

// GET /api/v1/operator/vehicle/list
const getVehicleList = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);

  const buses = await Bus.find({ operator: operatorDoc._id })
    .populate("driver", "licenseNumber status")
    .sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { total: buses.length, buses }, "Vehicles fetched successfully"));
});

// GET /api/v1/operator/vehicle/:busId
const getVehicleDetails = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);

  const bus = await Bus.findById(req.params.busId)
    .populate("operator", "companyName contact.phone contact.email")
    .populate("driver", "licenseNumber status licenseExpiry");

  if (!bus) throw new ApiError(404, "Vehicle not found");
  verifyBusOwnership(bus, operatorDoc);

  return res
    .status(200)
    .json(new ApiResponse(200, bus, "Vehicle details fetched successfully"));
});

// PATCH /api/v1/operator/vehicle/:busId/status
// Body: { status }  — "idle" | "running" | "maintenance" | "inactive"
const updateVehicleStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["idle", "running", "maintenance", "inactive"];

  if (!status || !allowed.includes(status))
    throw new ApiError(400, `Status must be one of: ${allowed.join(", ")}`);

  const operatorDoc = await getOperatorDoc(req.user._id);
  const bus = await Bus.findById(req.params.busId);
  if (!bus) throw new ApiError(404, "Vehicle not found");
  verifyBusOwnership(bus, operatorDoc);

  const previousStatus = bus.status;
  bus.status = status;
  if (status === "running") bus.lastSeen = new Date();
  await bus.save({ validateBeforeSave: false });

  if (status === "running" && previousStatus !== "running") {
    await Operator.findByIdAndUpdate(operatorDoc._id, { $inc: { activeBuses: 1 } });
  } else if (status !== "running" && previousStatus === "running") {
    await Operator.findByIdAndUpdate(operatorDoc._id, { $inc: { activeBuses: -1 } });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { _id: bus._id, status: bus.status }, "Vehicle status updated"));
});

// PATCH /api/v1/operator/vehicle/:busId/location
// Body: { lat, lng }
const updateVehicleLocation = asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;

  if (lat === undefined || lng === undefined)
    throw new ApiError(400, "lat and lng are required");
  if (typeof lat !== "number" || typeof lng !== "number")
    throw new ApiError(400, "lat and lng must be numbers");
  if (lat < -90 || lat > 90) throw new ApiError(400, "lat must be between -90 and 90");
  if (lng < -180 || lng > 180) throw new ApiError(400, "lng must be between -180 and 180");

  const operatorDoc = await getOperatorDoc(req.user._id);
  const bus = await Bus.findById(req.params.busId);
  if (!bus) throw new ApiError(404, "Vehicle not found");
  verifyBusOwnership(bus, operatorDoc);

  bus.currentLocation = { lat, lng, timestamp: new Date() };
  bus.lastSeen = new Date();
  await bus.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, { _id: bus._id, currentLocation: bus.currentLocation }, "Location updated"));
});

// DELETE /api/v1/operator/vehicle/:busId
const deleteVehicle = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);
  const bus = await Bus.findById(req.params.busId);
  if (!bus) throw new ApiError(404, "Vehicle not found");
  verifyBusOwnership(bus, operatorDoc);

  if (bus.driver) {
    await Driver.findByIdAndUpdate(bus.driver, { assignedBus: null, status: "available" });
  }

  await Operator.findByIdAndUpdate(operatorDoc._id, {
    $pull: { buses: bus._id },
    $inc: {
      totalBuses: -1,
      ...(bus.status === "running" ? { activeBuses: -1 } : {}),
    },
  });

  await Bus.findByIdAndDelete(req.params.busId);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Vehicle deleted successfully"));
});

// ── DRIVER MANAGEMENT ────────────────────────────────────────────────────────

// GET /api/v1/operator/driver/list
const getDriverList = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);

  const drivers = await Driver.find({ operator: operatorDoc._id })
    .populate("user", "FirstName email phone")
    .populate("assignedBus", "plateNumber busType status")
    .sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { total: drivers.length, drivers }, "Drivers fetched successfully"));
});

// GET /api/v1/operator/driver/available
const getAvailableDrivers = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);

  const drivers = await Driver.find({
    operator: operatorDoc._id,
    assignedBus: null,
    status: "available",
    licenseExpiry: { $gt: new Date() },
  })
    .populate("user", "FirstName email phone")
    .sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { total: drivers.length, drivers }, "Available drivers fetched"));
});

// POST /api/v1/operator/driver/add
// Body: { driverId }
const addDriverToOperator = asyncHandler(async (req, res) => {
  const { driverId } = req.body;
  if (!driverId) throw new ApiError(400, "driverId is required");

  const operatorDoc = await getOperatorDoc(req.user._id);

  const driver = await Driver.findById(driverId).populate("user", "FirstName email phone");
  if (!driver) throw new ApiError(404, "Driver not found");
  if (driver.operator)
    throw new ApiError(409, "This driver already belongs to an operator. Remove them first.");

  const [updatedDriver] = await Promise.all([
    Driver.findByIdAndUpdate(driverId, { operator: operatorDoc._id }, { new: true })
      .populate("user", "FirstName email phone"),
    Operator.findByIdAndUpdate(operatorDoc._id, { $addToSet: { drivers: driverId } }),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedDriver, "Driver added to operator successfully"));
});

// POST /api/v1/operator/driver/remove
// Body: { driverId }
const removeDriverFromOperator = asyncHandler(async (req, res) => {
  const { driverId } = req.body;
  if (!driverId) throw new ApiError(400, "driverId is required");

  const operatorDoc = await getOperatorDoc(req.user._id);
  const driver = await Driver.findById(driverId);
  if (!driver) throw new ApiError(404, "Driver not found");
  verifyDriverOwnership(driver, operatorDoc);

  if (driver.assignedBus)
    throw new ApiError(409, "Unassign the driver from their bus before removing them");

  await Promise.all([
    Driver.findByIdAndUpdate(driverId, { operator: null, status: "available" }),
    Operator.findByIdAndUpdate(operatorDoc._id, { $pull: { drivers: driverId } }),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Driver removed from operator successfully"));
});

// ── BUS ↔ DRIVER ASSIGNMENT ──────────────────────────────────────────────────

// POST /api/v1/operator/assignment/assign
// Body: { busId, driverId }
const assignDriverToBus = asyncHandler(async (req, res) => {
  const { busId, driverId } = req.body;
  if (!busId) throw new ApiError(400, "busId is required");
  if (!driverId) throw new ApiError(400, "driverId is required");

  const operatorDoc = await getOperatorDoc(req.user._id);

  const [bus, driver] = await Promise.all([
    Bus.findById(busId),
    Driver.findById(driverId),
  ]);

  if (!bus) throw new ApiError(404, "Vehicle not found");
  if (!driver) throw new ApiError(404, "Driver not found");

  verifyBusOwnership(bus, operatorDoc);
  verifyDriverOwnership(driver, operatorDoc);

  if (bus.driver) throw new ApiError(409, "Bus already has a driver. Unassign them first.");
  if (driver.assignedBus) throw new ApiError(409, "Driver is already assigned to another bus. Unassign them first.");
  if (new Date(driver.licenseExpiry) <= new Date())
    throw new ApiError(400, "Cannot assign — driver license has expired");
  if (driver.status === "suspended")
    throw new ApiError(400, "Cannot assign a suspended driver");

  const [updatedBus, updatedDriver] = await Promise.all([
    Bus.findByIdAndUpdate(busId, { driver: driverId }, { new: true })
      .populate("driver", "licenseNumber status"),
    Driver.findByIdAndUpdate(driverId, { assignedBus: busId, status: "on_duty" }, { new: true })
      .populate("assignedBus", "plateNumber busType status"),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, { bus: updatedBus, driver: updatedDriver }, "Driver assigned to bus successfully"));
});

// POST /api/v1/operator/assignment/unassign
// Body: { busId }
const unassignDriverFromBus = asyncHandler(async (req, res) => {
  const { busId } = req.body;
  if (!busId) throw new ApiError(400, "busId is required");

  const operatorDoc = await getOperatorDoc(req.user._id);
  const bus = await Bus.findById(busId);
  if (!bus) throw new ApiError(404, "Vehicle not found");
  verifyBusOwnership(bus, operatorDoc);

  if (!bus.driver) throw new ApiError(409, "This bus has no driver assigned");

  const [updatedBus, updatedDriver] = await Promise.all([
    Bus.findByIdAndUpdate(busId, { driver: null }, { new: true }),
    Driver.findByIdAndUpdate(bus.driver, { assignedBus: null, status: "available" }, { new: true }),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, { bus: updatedBus, driver: updatedDriver }, "Driver unassigned successfully"));
});

// POST /api/v1/operator/assignment/swap
// Body: { busId, newDriverId }
const swapDriverOnBus = asyncHandler(async (req, res) => {
  const { busId, newDriverId } = req.body;
  if (!busId) throw new ApiError(400, "busId is required");
  if (!newDriverId) throw new ApiError(400, "newDriverId is required");

  const operatorDoc = await getOperatorDoc(req.user._id);

  const [bus, newDriver] = await Promise.all([
    Bus.findById(busId),
    Driver.findById(newDriverId),
  ]);

  if (!bus) throw new ApiError(404, "Vehicle not found");
  if (!newDriver) throw new ApiError(404, "New driver not found");

  verifyBusOwnership(bus, operatorDoc);
  verifyDriverOwnership(newDriver, operatorDoc);

  if (newDriver.assignedBus && String(newDriver.assignedBus) !== String(busId))
    throw new ApiError(409, "New driver is already assigned to a different bus");
  if (new Date(newDriver.licenseExpiry) <= new Date())
    throw new ApiError(400, "Cannot assign — new driver license has expired");
  if (newDriver.status === "suspended")
    throw new ApiError(400, "Cannot assign a suspended driver");

  const ops = [];
  if (bus.driver && String(bus.driver) !== String(newDriverId)) {
    ops.push(Driver.findByIdAndUpdate(bus.driver, { assignedBus: null, status: "available" }));
  }
  ops.push(
    Driver.findByIdAndUpdate(newDriverId, { assignedBus: busId, status: "on_duty" }, { new: true })
      .populate("assignedBus", "plateNumber busType status"),
    Bus.findByIdAndUpdate(busId, { driver: newDriverId }, { new: true })
      .populate("driver", "licenseNumber status")
  );

  const results = await Promise.all(ops);
  const updatedDriver = results[results.length - 2];
  const updatedBus = results[results.length - 1];

  return res
    .status(200)
    .json(new ApiResponse(200, { bus: updatedBus, driver: updatedDriver }, "Driver swapped successfully"));
});

// GET /api/v1/operator/vehicle/unassigned
const getUnassignedBuses = asyncHandler(async (req, res) => {
  const operatorDoc = await getOperatorDoc(req.user._id);

  const buses = await Bus.find({
    operator: operatorDoc._id,
    driver: null,
    status: { $ne: "inactive" },
  }).sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { total: buses.length, buses }, "Unassigned buses fetched"));
});

export {
  // Profile
  getOperatorProfile,
  // Live map
  getLiveBuses,
  // Vehicle
  registerVehicle,
  getVehicleList,
  getVehicleDetails,
  updateVehicleStatus,
  updateVehicleLocation,
  deleteVehicle,
  // Driver management
  getDriverList,
  getAvailableDrivers,
  addDriverToOperator,
  removeDriverFromOperator,
  // Assignment
  assignDriverToBus,
  unassignDriverFromBus,
  swapDriverOnBus,
  getUnassignedBuses,
};
