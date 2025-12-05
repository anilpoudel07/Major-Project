import { z } from "zod";

export  const userRegisterSchema = z.object({
  nid: z.string().regex(/^\d{10,12}$|^\d{2}-\d{2}-\d{2}-\d{6}$/),
  FirstName: z.string().min(3).max(50),
  email: z.string().email(),
  phone: z.string().regex(/98\d{8}$/),
  password: z.string().min(6),
  user_type: z.enum(["passenger", "driver", "owner", "admin"]).array().min(1)
});

 export const userLoginSchema = z.object({
  email: z.string(),
  password: z.string().min(6)
});

