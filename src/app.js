import cors from "cors";
import cookieParser from "cookie-parser";
import express, { urlencoded } from "express";
import morgan from "morgan"


const app = express();

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

app.use(cookieParser());
app.use(morgan('combined'));
app.use(urlencoded({ extended: true, limit: "16kb" }));
app.use(express.json({ limit: "16kb" }));
app.use(express.static("public"));
import { sanitize } from "./middleware/sanitization.middleware.js";
app.use(sanitize)
import { errorHandler } from "./middleware/error.middleware.js";


app.use(errorHandler);
import healthcheckRouter from "./router/healthcheck.route.js";
//routes
app.use("/api/v1/healthcheck", healthcheckRouter);

import userRoute from "./router/user.route.js";
app.use("/api/v1/users", userRoute);

// Direct route for tap endpoint: /api/v1/user/tap
// import { handleTap } from "./controller/tap.controller.js";
// import { tapSchema } from "./validation/tap.validation.js";
// import { validate } from "./middleware/validate.middleware.js";
// app.post("/api/v1/user/tap", sanitize, validate(tapSchema), handleTap);

import adminRoute from "./router/admin.route.js"
app.use("/api/v1/admin/",adminRoute);

export default app;

