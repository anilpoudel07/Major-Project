import { Router } from "express";
import {
  getOperatorOverview,
  getRevenueTrend,
  getBusAnalytics,
  getDriverAnalytics,
  getBusDetailAnalytics,
  getDriverDetailAnalytics,
  getFleetComparison,
} from "../controller/operator.analytics.controller.js";


import {
  // Profile
  getOperatorProfile,
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
} from "../controller/operator.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireOperator } from "../middleware/role.middleware.js";
import { sanitize } from "../middleware/sanitization.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  vehicleRegisterSchema,
  vehicleUpdateLocationSchema,
} from "../validation/vechile.validation.js";

const router = Router();

// Every route in this file requires a logged-in operator
router.use(verifyJWT, requireOperator);

// ── Profile ───────────────────────────────────────────────────────────────────
// GET /api/operator/profile
router.route("/profile").get(getOperatorProfile);

// ── Vehicle routes ────────────────────────────────────────────────────────────
// POST /api/operator/vehicle/register
router
  .route("/vehicle/register")
  .post(sanitize, validate(vehicleRegisterSchema), registerVehicle);

// GET /api/operator/vehicle/list
router.route("/vehicle/list").get(getVehicleList);

// GET /api/operator/vehicle/unassigned — buses with no driver
router.route("/vehicle/unassigned").get(getUnassignedBuses);

// GET /api/operator/vehicle/:busId
// DELETE /api/operator/vehicle/:busId
router.route("/vehicle/:busId").get(getVehicleDetails).delete(deleteVehicle);

// PATCH /api/operator/vehicle/:busId/status
router.route("/vehicle/:busId/status").patch(sanitize, updateVehicleStatus);

// PATCH /api/operator/vehicle/:busId/location
router
  .route("/vehicle/:busId/location")
  .patch(sanitize, validate(vehicleUpdateLocationSchema), updateVehicleLocation);

// ── Driver routes ─────────────────────────────────────────────────────────────
// GET /api/operator/driver/list
router.route("/driver/list").get(getDriverList);

// GET /api/operator/driver/available
router.route("/driver/available").get(getAvailableDrivers);

// POST /api/operator/driver/add
router.route("/driver/add").post(sanitize, addDriverToOperator);

// POST /api/operator/driver/remove
router.route("/driver/remove").post(sanitize, removeDriverFromOperator);

// ── Assignment routes ─────────────────────────────────────────────────────────
// POST /api/operator/assignment/assign
router.route("/assignment/assign").post(sanitize, assignDriverToBus);

// POST /api/operator/assignment/unassign
router.route("/assignment/unassign").post(sanitize, unassignDriverFromBus);

// POST /api/operator/assignment/swap
router.route("/assignment/swap").post(sanitize, swapDriverOnBus);
router.route("/analytics/overview").get(getOperatorOverview);
 
// GET /api/v1/operator/analytics/revenue
//   → time-series revenue + trips (hourly/daily/monthly depending on period)
router.route("/analytics/revenue").get(getRevenueTrend);
 
// GET /api/v1/operator/analytics/buses
//   → all buses ranked by period revenue with per-bus stats
router.route("/analytics/buses").get(getBusAnalytics);
 
// GET /api/v1/operator/analytics/drivers
//   → all drivers ranked by period trips with per-driver stats
router.route("/analytics/drivers").get(getDriverAnalytics);
 
// GET /api/v1/operator/analytics/fleet-comparison
//   → side-by-side revenue comparison of all buses
router.route("/analytics/fleet-comparison").get(getFleetComparison);
 
// GET /api/v1/operator/analytics/buses/:busId
//   → deep dive on one bus: trend, drivers who drove it, summary
router.route("/analytics/buses/:busId").get(getBusDetailAnalytics);
 
// GET /api/v1/operator/analytics/drivers/:driverId
//   → deep dive on one driver: trend, buses driven, summary
router.route("/analytics/drivers/:driverId").get(getDriverDetailAnalytics);




export default router
