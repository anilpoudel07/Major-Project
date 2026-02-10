


import { z } from "zod";

export const initiatePaymentSchema = z.object({
  txnId: z.string().min(1, "Transaction ID is required"),
});

export const verifyPaymentSchema = z.object({
  pidx: z.string().min(1, "pidx is required"),
});

export const manualTopupSchema = z.object({
  amount: z.number().min(10, "Minimum top-up is Rs. 10"),
});

export const paymentStatusSchema = z.object({
  pidx: z.string().optional(),
  txnId: z.string().optional(),
}).refine((data) => data.pidx || data.txnId, {
  message: "Either pidx or txnId is required",
});
