import { z } from "zod";

export const userRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nid: z.string().regex(/^\d{10,12}$|^\d{2}-\d{2}-\d{2}-\d{6}$/).optional(),
  FirstName: z.string().min(3).max(50).optional(),
  phone: z.string().regex(/98\d{8}$/).optional(),
  user_type: z.array(z.enum(["passenger", "driver", "operator", "admin"])).optional(),
}).refine((data) => {

  if (data.email !== process.env.ADMIN_EMAIL) {
    return data.nid && data.FirstName && data.phone;
  }
  return true;
}, { message: "NID, Name, and Phone are required" });

export const userLoginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password too short")
});

