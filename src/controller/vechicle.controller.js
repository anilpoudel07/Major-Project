import { asyncHandler } from "../utils/asyncHandler.js";
import { Bus } from "../model/vechile.model.js";
import { Operator } from "../model/operator.model.js";
import { Driver } from "../model/driver.model.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// ═══════════════════════════════════════════════════════════
// REGISTER — Vehicle
// POST /api/vehicle/register
// Protected: verifyJWT (operator only)
// Body: { plateNumber, busType?, maxCapacity, driverId? }
// ═══════════════════════════════════════════════════════════
const registerVehicle = asyncHandler(async (req, res) => {
  const { plateNumber, busType, maxCapacity, driverId } = req.body;

  if (!plateNumber?.trim())
    throw new ApiError(400, "Plate number is required");
  if (!maxCapacity || maxCapacity < 1)
    throw new ApiError(400, "Valid max capacity is required");

  if (!req.user.user_type.includes("operator"))
    throw new ApiError(403, "Only operators can register vehicles");

  const operatorDoc = await Operator.findOne({ owner: req.user._id });
  if (!operatorDoc)
    throw new ApiError(403, "No operator profile found for your account");

  // Duplicate plate check
  const existingBus = await Bus.findOne({ plateNumber: plateNumber.toUpperCase() });
  if (existingBus)
    throw new ApiError(409, "A vehicle with this plate number already exists");

  // Validate driverId if provided
  if (driverId) {
    const driverDoc = await Driver.findById(driverId);
    if (!driverDoc)
      throw new ApiError(404, "Driver not found");
    if (String(driverDoc.operator) !== String(operatorDoc._id))
      throw new ApiError(403, "This driver does not belong to your operator account");
    if (driverDoc.assignedBus)
      throw new ApiError(409, "This driver is already assigned to another vehicle");
  }

  const bus = await Bus.create({
    plateNumber,
    busType: busType || "standard",
    maxCapacity,
    operator: operatorDoc._id,
    driver: driverId || null,
  });

  // Keep operator bus list + count in sync
  await Operator.findByIdAndUpdate(operatorDoc._id, {
    $push: { buses: bus._id },
    $inc: { totalBuses: 1 },
  });

  // Keep driver's assignedBus in sync
  if (driverId) {
    await Driver.findByIdAndUpdate(driverId, { assignedBus: bus._id });
  }

  const populatedBus = await Bus.findById(bus._id)
    .populate("operator", "companyName contact.phone")
    .populate("driver", "licenseNumber status");

  return res
    .status(201)
    .json(new ApiResponse(201, populatedBus, "Vehicle registered successfully"));
});

// ═══════════════════════════════════════════════════════════
// GET OPERATOR VEHICLES
// GET /api/vehicle/list
// Protected: verifyJWT (operator only)
// ═══════════════════════════════════════════════════════════
const getOperatorVehicles = asyncHandler(async (req, res) => {
  if (!req.user.user_type.includes("operator"))
    throw new ApiError(403, "Only operators can view their vehicle list");

  const operatorDoc = await Operator.findOne({ owner: req.user._id });
  if (!operatorDoc)
    throw new ApiError(403, "No operator profile found for your account");

  const buses = await Bus.find({ operator: operatorDoc._id })
    .populate("driver", "licenseNumber status assignedBus")
    .sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { total: buses.length, buses }, "Vehicles fetched successfully"));
});

// ═══════════════════════════════════════════════════════════
// GET VEHICLE DETAILS
// GET /api/vehicle/:busId
// Protected: verifyJWT
// ═══════════════════════════════════════════════════════════
const getVehicleDetails = asyncHandler(async (req, res) => {
  const { busId } = req.params;

  const bus = await Bus.findById(busId)
    .populate("operator", "companyName contact.phone contact.email")
    .populate("driver", "licenseNumber status licenseExpiry");

  if (!bus)
    throw new ApiError(404, "Vehicle not found");

  // Operators can only view their own buses
  if (
    req.user.user_type.includes("operator") &&
    String(bus.operator._id) !== String((await Operator.findOne({ owner: req.user._id }))?._id)
  ) {
    throw new ApiError(403, "You do not have access to this vehicle");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, bus, "Vehicle details fetched successfully"));
});

// ═══════════════════════════════════════════════════════════
// UPDATE VEHICLE STATUS
// PATCH /api/vehicle/:busId/status
// Protected: verifyJWT (operator or admin)
// Body: { status }  — "idle" | "running" | "maintenance" | "inactive"
// ═══════════════════════════════════════════════════════════
const updateVehicleStatus = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const { status } = req.body;

  const allowedStatuses = ["idle", "running", "maintenance", "inactive"];
  if (!status || !allowedStatuses.includes(status))
    throw new ApiError(400, `Status must be one of: ${allowedStatuses.join(", ")}`);

  const bus = await Bus.findById(busId);
  if (!bus) throw new ApiError(404, "Vehicle not found");

  // Operators can only update their own buses
  if (req.user.user_type.includes("operator")) {
    const operatorDoc = await Operator.findOne({ owner: req.user._id });
    if (!operatorDoc || String(bus.operator) !== String(operatorDoc._id))
      throw new ApiError(403, "You do not have permission to update this vehicle");
  }

  bus.status = status;
  if (status === "running") bus.lastSeen = new Date();
  await bus.save({ validateBeforeSave: false });

  // Keep operator activeBuses count in sync
  if (status === "running") {
    await Operator.findByIdAndUpdate(bus.operator, { $inc: { activeBuses: 1 } });
  } else if (bus.status === "running") {
    await Operator.findByIdAndUpdate(bus.operator, { $inc: { activeBuses: -1 } });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { _id: bus._id, status: bus.status }, "Vehicle status updated successfully"));
});

// ═══════════════════════════════════════════════════════════
// UPDATE VEHICLE LOCATION
// PATCH /api/vehicle/:busId/location
// Protected: verifyJWT (driver of this bus or operator)
// Body: { lat, lng }
// ═══════════════════════════════════════════════════════════
const updateVehicleLocation = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const { lat, lng } = req.body;

  if (lat === undefined || lng === undefined)
    throw new ApiError(400, "lat and lng are required");
  if (typeof lat !== "number" || typeof lng !== "number")
    throw new ApiError(400, "lat and lng must be numbers");
  if (lat < -90 || lat > 90)
    throw new ApiError(400, "lat must be between -90 and 90");
  if (lng < -180 || lng > 180)
    throw new ApiError(400, "lng must be between -180 and 180");

  const bus = await Bus.findById(busId);
  if (!bus) throw new ApiError(404, "Vehicle not found");

  // Only the assigned driver OR the operator can update location
  const isAssignedDriver =
    req.user.user_type.includes("driver") &&
    String(bus.driver) === String(req.user._id);

  const isOwnerOperator = req.user.user_type.includes("operator") &&
    String(bus.operator) === String((await Operator.findOne({ owner: req.user._id }))?._id);

  if (!isAssignedDriver && !isOwnerOperator && !req.user.user_type.includes("admin"))
    throw new ApiError(403, "You do not have permission to update this vehicle's location");

  bus.currentLocation = { lat, lng, timestamp: new Date() };
  bus.lastSeen = new Date();
  await bus.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { _id: bus._id, currentLocation: bus.currentLocation },
        "Vehicle location updated successfully"
      )
    );
});

// ═══════════════════════════════════════════════════════════
// DELETE VEHICLE
// DELETE /api/vehicle/:busId
// Protected: verifyJWT (operator or admin)
// ═══════════════════════════════════════════════════════════
const deleteVehicle = asyncHandler(async (req, res) => {
  const { busId } = req.params;

  const bus = await Bus.findById(busId);
  if (!bus) throw new ApiError(404, "Vehicle not found");

  // Only the owning operator or admin can delete
  if (req.user.user_type.includes("operator")) {
    const operatorDoc = await Operator.findOne({ owner: req.user._id });
    if (!operatorDoc || String(bus.operator) !== String(operatorDoc._id))
      throw new ApiError(403, "You do not have permission to delete this vehicle");
  } else if (!req.user.user_type.includes("admin")) {
    throw new ApiError(403, "Only operators or admins can delete vehicles");
  }

  // Unassign driver if one is attached
  if (bus.driver) {
    await Driver.findByIdAndUpdate(bus.driver, { assignedBus: null });
  }

  // Remove from operator's bus list + decrement count
  await Operator.findByIdAndUpdate(bus.operator, {
    $pull: { buses: bus._id },
    $inc: {
      totalBuses: -1,
      ...(bus.status === "running" ? { activeBuses: -1 } : {}),
    },
  });

  await Bus.findByIdAndDelete(busId);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Vehicle deleted successfully"));
});

export {
  registerVehicle,
  getOperatorVehicles,
  getVehicleDetails,
  updateVehicleStatus,
  updateVehicleLocation,
  deleteVehicle,
};
