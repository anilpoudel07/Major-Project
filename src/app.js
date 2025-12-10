import cors from "cors";
import cookieParser from "cookie-parser";
import express, { urlencoded } from "express";
import morgan from "morgan";
import http from "http";
// import { Server } from "socket.io";
import { Bus } from "./model/vechile.model.js"; // adjust as needed

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
import healthcheckRouter from "./router/healthcheck.route.js";
//routes
app.use("/api/v1/healthcheck", healthcheckRouter);

import userRoute from "./router/user.route.js";
app.use("/api/v1/users", userRoute);
import adminRoute from "./router/admin.route.js";
app.use("/api/v1/admin/", adminRoute);
app.post("/api/v1/user/tap", async (req, res) => {
  // const {rfid,}
  console.log("user tapped");
});
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
        gps: { lat, lng },
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

// =====================================================
// 2️⃣ GET → fetch current location of a bus
// =====================================================
app.get("/api/v1/bus/:busId", async (req, res) => {
  try {
    const bus = await Bus.findOne({ _id: req.params.busId });
    if (!bus) return res.status(404).json({ error: "Bus not found" });

    res.json(bus);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

export default app;
