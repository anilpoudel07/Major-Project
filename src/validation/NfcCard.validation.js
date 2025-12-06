import {z} from "zod";
export const nfcCardSchema = z.object({
    cardUid:z
    .string()
    .min(1,"cardUid is required"),
    user:z.string().min(1,"userId is reqquired"),
    balance:z
    .number()
    .min(0,"Balance cannot be negative")
    .optional()
    .default(0),
    cardType:z
    .enum(["personal","student","senior"]),
  status: z
    .enum(["active", "lost", "blocked"])
    .optional()
    .default("active"),
    isActive:z.boolean().optional.default(true),
      lastUsedAt: z
    .string()
    .datetime({ message: "lastUsedAt must be a valid ISO date string" })
    .optional(),

  issuedAt: z
    .string()
    .datetime({ message: "issuedAt must be a valid ISO date string" })
    .optional(),

  expiresAt: z
    .string()
    .datetime({ message: "expiresAt must be a valid ISO date string" })
    .optional(),

  isVerified: z.boolean().optional().default(false),
})