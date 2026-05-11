

/*
import cors from "cors";
import cookieParser from "cookie-parser";
import express, { urlencoded } from "express";
import morgan from "morgan";

// import { Bus } from "./model/vechile.model.js"; // adjust as needed

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(morgan("combined"));
app.use(urlencoded({ extended: true, limit: "16kb" }));
app.use(express.json({ limit: "16kb" }));
app.use(express.static("public"));
import { sanitize } from "./middleware/sanitization.middleware.js";
app.use(sanitize);
import { errorHandler } from "./middleware/error.middleware.js";

app.use(errorHandler);
//routes
//
app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err); // ✅ prevent double send
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

import userRoute from "./router/user.route.js";
app.use("/api/v1/users", userRoute);
import paymentRoute from "./router/payment.routes.js";
app.use("/api/v1/users/payment", paymentRoute);
import { handleTap } from "./controller/tap.controller.js";
import { tapSchema } from "./validation/tap.validation.js";
import { validate } from "./middleware/validate.middleware.js";
app.post("/api/v1/user/tap", sanitize, validate(tapSchema), handleTap);

import adminRoute from "./router/admin.route.js";
import { Bus } from "./model/vechile.model.js";
import { calculateDistance } from "./utils/distance.utils.js";
app.use("/api/v1/admin/", adminRoute);
import operatorRoute from "./router/operator.router.js";
app.use("/api/v1/operator/",operatorRoute);
app.post("/bus/update-location", async (req, res) => {
  try {
    const { busId, lat, lng } = req.body;

    if (!busId || !lat || !lng) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const bus = await Bus.findOneAndUpdate(
      { _id: busId },
      {
        _id: busId,
        gps: [{ lat, lng }],
        last_seen: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, bus });
  } catch (err) {
    console.log(`error:${err}`);

    res.status(500).json({ error: err });
  }
});

app.get("/api/v1/bus/:busId", async (req, res) => {
  try {
    const bus = await Bus.findOne({ _id: req.params.busId });
    if (!bus) return res.status(404).json({ error: "Bus not found" });

    res.json(bus);
  } catch (err) {
    res.status(500).json({ error: `${err}` });
  }
});

let lastLat = null;
let lastLon = null;
let totalDistance = 0;

app.post("/api/v1/bus/update", (req, res) => {
  const { latitude, longitude } = req.body;

  // first GPS update
  if (lastLat === null || lastLon === null) {
    lastLat = latitude;
    lastLon = longitude;
    return res.json({ totalDistance, added: 0 });
  }

  // distance from last point to new point
  const added = calculateDistance(lastLat, lastLon, latitude, longitude);

  totalDistance += added;

  // update last coordinates
  lastLat = latitude;
  lastLon = longitude;

  res.json({
    addedDistance: added,
    totalDistance,
  });
});

export default app;
*/



// ── Core imports (must be at top — no interleaved import/use) ──────────────
import cors from "cors";
import cookieParser from "cookie-parser";
import express, { urlencoded } from "express";
import morgan from "morgan";

import { sanitize } from "./middleware/sanitization.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { validate } from "./middleware/validate.middleware.js";
import { tapSchema } from "./validation/tap.validation.js";
import { handleTap } from "./controller/tap.controller.js";
import { Bus } from "./model/vechile.model.js";

import userRoute from "./router/user.route.js";
import paymentRoute from "./router/payment.routes.js";
import adminRoute from "./router/admin.route.js";
import operatorRoute from "./router/operator.router.js";

// ── App setup ───────────────────────────────────────────────────────────────
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(morgan("combined"));
app.use(urlencoded({ extended: true, limit: "16kb" }));
app.use(express.json({ limit: "16kb" }));
app.use(express.static("public"));
app.use(sanitize);

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/v1/users", userRoute);
app.use("/api/v1/users/payment", paymentRoute);
app.use("/api/v1/admin/", adminRoute);
app.use("/api/v1/operator/", operatorRoute);

// NFC Tap endpoint — called by the ESP8266 device
// POST /api/v1/user/tap
// Body: { rfid, busId, latitude, longitude }
app.post("/api/v1/user/tap", sanitize, validate(tapSchema), handleTap);

// Single bus lookup — public utility
// GET /api/v1/bus/:busId
app.get("/api/v1/bus/:busId", async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.busId)
      .populate("driver", "licenseNumber status")
      .populate("operator", "companyName");
    if (!bus) return res.status(404).json({ error: "Bus not found" });
    res.json(bus);
  } catch (err) {
    res.status(500).json({ error: `${err}` });
  }
});

// ── Error handler — MUST be last ────────────────────────────────────────────
app.use(errorHandler);

// Fallback inline error handler (catches anything errorHandler re-throws)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

export default app;
