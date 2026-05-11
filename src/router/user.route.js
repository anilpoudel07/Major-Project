import { Router } from "express";

import {
  registerUser,
  loginUser,
  logoutUser,
  registerDriver,
  loginDriver,
  getDriverProfile,
  registerOperator,
  loginOperator,
  getOperatorProfile,
  refreshAccessToken,
} from "../controller/user.auth.controller.js";

import {
  updateVehicleLocation,
} from "../controller/vechicle.controller.js";

// ── NEW: driver dashboard controllers ─────────────────────────────────────────
import { getMyBus, updateMyBusLocation } from "../controller/driver.controller.js";

// ── NFC controller ─────────────────────────────────────────────────────────────
import { registerNfcCard } from "../controller/nfc.controller.js";

// ── Models ─────────────────────────────────────────────────────────────────────
import { NfcCard } from "../model/Nfc.model.js";

// ── Middleware ──────────────────────────────────────────────────────────────────
import { verifyJWT } from "../middleware/auth.middleware.js";
import { sanitize } from "../middleware/sanitization.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  requireOperator,
  requireDriver,
} from "../middleware/role.middleware.js";

// ── Validation schemas ──────────────────────────────────────────────────────────
import { userRegisterSchema, userLoginSchema } from "../validation/user.validation.js";
import { driverRegisterSchema } from "../validation/driver.validation.js";
import {
  operatorRegisterSchema,
  operatorLoginSchema,
} from "../validation/operator.validation.js";
import { vehicleUpdateLocationSchema } from "../validation/vechile.validation.js";
import { nfcCardSchema } from "../validation/NfcCard.validation.js";

const router = Router();

// ── PASSENGER routes ──────────────────────────────────────────────────────────

// POST  /api/v1/users/register
router.route("/register").post(sanitize, validate(userRegisterSchema), registerUser);

// POST  /api/v1/users/login
router.route("/login").post(sanitize, validate(userLoginSchema), loginUser);

// POST  /api/v1/users/logout
router.route("/logout").post(verifyJWT, logoutUser);

/**
 * GET /api/v1/users/profile
 * Returns the logged-in user's profile plus their default NFC card balance.
 *
 * FIX: NfcCard was missing an import and the lookup used the wrong field (`id`
 * instead of `_id`). Also uses `defaultNfcCard` (the correct User field name).
 */
router.route("/profile").get(verifyJWT, async (req, res) => {
  try {
    const user = req.user;

    // Look up the user's default NFC card by its ObjectId
    const nfcCard = user.defaultNfcCard
      ? await NfcCard.findById(user.defaultNfcCard).lean()
      : null;

    return res.status(200).json({
      success: true,
      message: "Profile successfully fetched",
      user: {
        ...user.toObject(),
        balance: nfcCard?.balance ?? null,
        cardUid: nfcCard?.cardUid ?? null,
      },
    });
  } catch (error) {
    console.error("Error while fetching profile:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch profile" });
  }
});

// POST  /api/v1/users/registerNfc
router
  .route("/registerNfc")
  .post(sanitize, verifyJWT, validate(nfcCardSchema), registerNfcCard);

// ── DRIVER routes ─────────────────────────────────────────────────────────────

// POST  /api/v1/users/driver/register
router
  .route("/driver/register")
  .post(sanitize, validate(driverRegisterSchema), registerDriver);

// GET   /api/v1/users/driver/profile
router.route("/driver/profile").get(verifyJWT, requireDriver, getDriverProfile);

// POST  /api/v1/users/driver/logout
router.route("/driver/logout").post(verifyJWT, logoutUser);

/**
 * GET /api/v1/users/driver/my-bus
 * Driver dashboard — returns the bus assigned to this driver with live location.
 * Poll every 5 s from the frontend to keep the map pin fresh.
 */
router.route("/driver/my-bus").get(verifyJWT, requireDriver, getMyBus);

/**
 * PATCH /api/v1/users/driver/my-bus/location
 * Driver pushes GPS coordinates for their assigned bus.
 * Body: { lat: Number, lng: Number }
 *
 * The ESP8266 / mobile app on the bus calls this endpoint periodically.
 * The operator's live map reads these coordinates via GET /operator/buses/live.
 */
router
  .route("/driver/my-bus/location")
  .patch(
    verifyJWT,
    requireDriver,
    sanitize,
    validate(vehicleUpdateLocationSchema),
    updateMyBusLocation
  );

// ── OPERATOR routes ───────────────────────────────────────────────────────────

// POST  /api/v1/users/operator/register
router
  .route("/operator/register")
  .post(sanitize, validate(operatorRegisterSchema), registerOperator);

// POST  /api/v1/users/operator/login
router
  .route("/operator/login")
  .post(sanitize, validate(operatorLoginSchema), loginOperator);

// GET   /api/v1/users/operator/profile
router
  .route("/operator/profile")
  .get(verifyJWT, requireOperator, getOperatorProfile);

// POST  /api/v1/users/operator/logout
router.route("/operator/logout").post(verifyJWT, logoutUser);

// ── VEHICLE routes (driver or operator can update location) ───────────────────

// PATCH /api/v1/users/vehicle/:busId/location
// Used when the caller knows the busId explicitly (e.g. operator dashboard).
// For drivers who don't know the busId use PATCH /driver/my-bus/location above.
router
  .route("/vehicle/:busId/location")
  .patch(
    verifyJWT,
    sanitize,
    validate(vehicleUpdateLocationSchema),
    updateVehicleLocation
  );

// ── SHARED / UTILITY ──────────────────────────────────────────────────────────

// POST  /api/v1/users/auth/refresh-token
router.route("/auth/refresh-token").post(refreshAccessToken);

export default router;


/*

import { Router } from "express";

import {
  registerUser,
  loginUser,
  logoutUser,
  registerDriver,
  loginDriver,
  getDriverProfile,
  registerOperator,
  loginOperator,
  getOperatorProfile,
  refreshAccessToken,
} from "../controller/user.auth.controller.js";

import {
  registerVehicle,
  getOperatorVehicles,
  getVehicleDetails,
  updateVehicleStatus,
  updateVehicleLocation,
  deleteVehicle,
} from "../controller/vechicle.controller.js";

// ── Middleware ─────────────────────────────────────────────
import { verifyJWT } from "../middleware/auth.middleware.js";
import { sanitize } from "../middleware/sanitization.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  requireOperator,
  requireDriver,
  requireAdmin,
} from "../middleware/role.middleware.js";

// ── Validation schemas ─────────────────────────────────────
import {
  userRegisterSchema,
  userLoginSchema,
} from "../validation/user.validation.js";
import {
  driverRegisterSchema,

} from "../validation/driver.validation.js";
import {
  operatorRegisterSchema,
  operatorLoginSchema,
} from "../validation/operator.validation.js";
import {
  vehicleRegisterSchema,
  vehicleUpdateLocationSchema,
} from "../validation/vechile.validation.js";
import { nfcCardSchema} from "../validation/NfcCard.validation.js";
const router = Router();

// PASSENGER ROUTES

// POST  /api/user/register
router
  .route("/user/register")
  .post(sanitize, validate(userRegisterSchema), registerUser);

// POST  /api/user/login
router
  .route("/user/login")
  .post(sanitize, validate(userLoginSchema), loginUser);

// POST  /api/user/logout         [auth required]
router
  .route("/user/logout")
  .post(verifyJWT, logoutUser);

// DRIVER ROUTES

// POST  /api/driver/register
router
  .route("/driver/register")
  .post(sanitize, validate(driverRegisterSchema), registerDriver);


// GET   /api/driver/profile      [driver auth required]
router
  .route("/driver/profile")
  .get(verifyJWT, requireDriver, getDriverProfile);

// POST  /api/driver/logout       [auth required]
router
  .route("/driver/logout")
  .post(verifyJWT, logoutUser);

// OPERATOR ROUTES

// POST  /api/operator/register
router
  .route("/operator/register")
  .post(sanitize, validate(operatorRegisterSchema), registerOperator);

// POST  /api/operator/login
router
  .route("/operator/login")
  .post(sanitize, validate(operatorLoginSchema), loginOperator);

// GET   /api/operator/profile    [operator auth required]
router
  .route("/operator/profile")
  .get(verifyJWT, requireOperator, getOperatorProfile);

// POST  /api/operator/logout     [auth required]
router
  .route("/operator/logout")
  .post(verifyJWT, logoutUser);

// ══════════════════════════════════════════════════════════
// VEHICLE ROUTES
// ══════════════════════════════════════════════════════════

// POST  /api/vehicle/register    [operator auth required]
// PATCH /api/vehicle/:busId/location  [driver of bus or operator]
router
  .route("/vehicle/:busId/location")
  .patch(
    verifyJWT,
    sanitize,
    validate(vehicleUpdateLocationSchema),
    updateVehicleLocation
  );

// SHARED / UTILITY ROUTES

// POST  /api/auth/refresh-token
router
  .route("/auth/refresh-token")
  .post(refreshAccessToken);









router.route("/profile").get(verifyJWT, async (req, res) => {
  try {
    const user = req.user;

    // get user's default card id
    const cardid = user.default_card;

    // fetch card data
    const nfcCard = await NfcCard.findOne({ id: cardid });
    const userData = {
      ...user._doc,
      balance: nfcCard.balance,
      cardUid: nfcCard.cardUid,
    };
    console.log("userData: ", userData);

    return res.status(200).json({
      success: true,
      user: {
        ...user._doc,
        balance: nfcCard.balance,
        cardUid: nfcCard.cardUid,
      },
      message: "Profile successfully fetched",
    });
  } catch (error) {
    console.error("error while fetching profile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
});
import { registerNfcCard } from "../controller/nfc.controller.js";
router
  .route("/register")
  .post(sanitize, validate(userRegisterSchema), registerUser);
router.route("/login").post(sanitize, validate(userLoginSchema), loginUser);
router.route("/logout").post(verifyJWT, logoutUser);
router
  .route("/registerNfc")
  .post(sanitize, verifyJWT, validate(nfcCardSchema), registerNfcCard);

export default router;
*/
