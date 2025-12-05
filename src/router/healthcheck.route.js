import { Router } from "express";
import healthcheck from "../controller/healthcheck.controller.js";
const router = Router();

// Log to see if the route is being hit
console.log("Setting up the healthcheck route");

// Define the route for healthcheck
router.route("/").get(healthcheck);

export default router;