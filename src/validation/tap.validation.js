import { z } from "zod";

export const tapSchema = z.object({
  rfid: z.string().min(1, "RFID is required"),
  busId: z.string().min(1, "Bus ID is required"),
  latitude: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= -90 && num <= 90;
    },
    { message: "Invalid latitude. Must be between -90 and 90" }
  ),
  longitude: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num >= -180 && num <= 180;
    },
    { message: "Invalid longitude. Must be between -180 and 180" }
  )
});

