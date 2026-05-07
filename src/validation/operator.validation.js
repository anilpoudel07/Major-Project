
import { z } from "zod";

export const operatorRegisterSchema = z.object({
  nid: z
    .string()
    .trim()
    .regex(/^\d{10,12}$|^\d{2}-\d{2}-\d{2}-\d{6}$/, "Invalid Nepal National ID format"),

  FirstName: z.string().trim().min(3, "First name must be at least 3 characters").max(50),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  phone: z
    .string()
    .trim()
    .regex(/^98\d{8}$/, "Invalid Nepali mobile number — must start with 98 and be 10 digits"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  company_name: z.string().trim().min(2, "Company name must be at least 2 characters"),
});

export const operatorLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
