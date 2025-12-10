import { z } from "zod";

export const nfcCardSchema = z.object({
  cardUid: z
    .string()
    .min(1, "cardUid is required")
    .regex(/^[A-F0-9]+$/i, "Invalid card UID format")
    .transform((val) => val.toUpperCase()),

  balance: z
    .number()
    .min(0, "Balance cannot be negative")
    .default(0)
    .optional(),

  cardType: z.enum(["personal", "student", "senior"]).default("personal"),

  status: z.enum(["active", "lost", "blocked"]).default("active"),

  isActive: z.boolean().default(true),

  lastUsedAt: z
    .string()
    .datetime({ message: "lastUsedAt must be a valid ISO date string" })
    .optional(),

  issuedAt: z
    .string()
    .datetime({ message: "issuedAt must be a valid ISO date" })
    .optional(),

  expiresAt: z
    .string()
    .datetime({ message: "expiresAt must be a valid date" })
    .optional(),

  isVerified: z.boolean().default(false),
});
