import z from "zod"
const roleSchema = z.object({
    role:z.enum(["driver","passenger","operator","admin"])
})