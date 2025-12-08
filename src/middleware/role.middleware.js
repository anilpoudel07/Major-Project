import ApiError from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"


export const requireRole = (roles)=>{
    return asyncHandler((req, res, next)=>{
        if(!req.user){
            throw new ApiError(401,"Login required !!!")
        }
        const hasRole = roles.some((role)=>req.user.user_type?.includes(role))
 if(!hasRole){
    throw new ApiError(403,`Acess Denied. Required:${roles.join("or")}`)

 }
 next();
    })
}
export const requireAdmin = requireRole(["admin"]);
export const requireDriver = requireRole(['driver']);
export const requireOperator = requireRole(['operator']);
export const requirePassenger = requireRole(['passenger']);
