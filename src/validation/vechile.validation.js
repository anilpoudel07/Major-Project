import { z } from "zod";

export const vehicleRegisterSchema = z.object({
  plateNumber: z
    .string()
    .trim()
    .min(4, "Plate number must be at least 4 characters")
    .max(10, "Plate number must not exceed 10 characters"),
  busType: z.enum(["standard", "express", "luxury"]).optional().default("standard"),
  maxCapacity: z
    .number({ invalid_type_error: "Max capacity must be a number" })
    .int("Max capacity must be a whole number")
    .min(1, "Max capacity must be at least 1")
    .max(100, "Max capacity cannot exceed 100"),
  driverId: z.string().optional(), // ObjectId string — optional at registration
});

export const vehicleUpdateLocationSchema = z.object({
  lat: z
    .number({ invalid_type_error: "lat must be a number" })
    .min(-90, "lat must be between -90 and 90")
    .max(90, "lat must be between -90 and 90"),
  lng: z
    .number({ invalid_type_error: "lng must be a number" })
    .min(-180, "lng must be between -180 and 180")
    .max(180, "lng must be between -180 and 180"),
});
