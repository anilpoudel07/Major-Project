import { z } from "zod";

export const userRegisterSchema = z.object({
  nid: z.string().regex(/^\d{10,12}$|^\d{2}-\d{2}-\d{2}-\d{6}$/, "Invalid NID format"),
  FirstName: z.string().min(3, "First name too short").max(50, "First name too long"),
  email: z.string().email("Invalid email"),
  phone: z.string().regex(/98\d{8}$/, "Invalid Nepali phone number"),
  password: z.string().min(6, "Password too short"),
  user_type: z.enum(["passenger", "driver", "owner", "admin"]).array().min(1, "Select at least one user type")
});

export const userLoginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password too short")
});

