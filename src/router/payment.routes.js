import express from "express";
import {
  initiatePayment,
  verifyPaymentController,
  checkPaymentStatus,
  khaltiCallback,
  paymentTransaction

} from "../controller/payment.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requirePassenger } from "../middleware/role.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { sanitize } from "../middleware/sanitization.middleware.js";


import {
  initiatePaymentSchema,
  verifyPaymentSchema,
} from "../validation/payment.validation.js";

const router = express.Router();
router.post("/initiate", verifyJWT,
  requirePassenger,
  sanitize,
  validate(initiatePaymentSchema),
  initiatePayment);
router.post("/verify", 
  verifyJWT, 
  requirePassenger,
  sanitize,
  validate(verifyPaymentSchema),
  verifyPaymentController // Keep it here only
);
router.get("/status", sanitize, checkPaymentStatus);
router.get("/khalti/callback", khaltiCallback);
router.post("/transcation", verifyJWT, paymentTransaction);


export default router;
