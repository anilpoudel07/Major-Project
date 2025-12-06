import { success } from "zod";
import { User } from "../model/user.model.js"
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getAllData = asyncHandler(async (req, res , next)=>{
    const user = await User.find().select("-password, -refreshToken");
    res.json(new ApiResponse(200,user,"All users are fetched "))
})
export const updateRoleByAdmin = asyncHandler(async(req,res,next)=>{
    const {role} = req.body;
    const validRoles = ["driver","operator","admin"]
    if(!validRoles.includes(role)){
        throw new ApiError(400,"Invalid role ")
    }
    await User.findByIdAndUpdate(
        req.params.userId,
        {
            $addToset:{
                user_type:role
            }
        },
        {
            new:true
        }
    )
    res.json(new ApiResponse(200,{},`${role} role removed!!!`))
})
export const removeRole = asyncHandler(async(req,res)=>{
    const {role} = req.body;
    await User.findByIdAndUpdate(
        req.params.userId,
        {
            $pull:{
                user_type:roll
            }
        },
        {
            new:true
        }
    )
    res.json(new ApiResponse(200,{},`${role} role removed!!`))
})
export const deleteUser = asyncHandler(async(req,res)=>{
    const {userId} = req.params
    if(req.user._id ===userId){
        throw new ApiError(400,"You cannot delete yourself")
    }
    const deletedUser = await User.findByIdAndDelete(userId);
    return res.json(ApiResponse({
        success:true,
        message:"User deleted permanently",
        deleteUser:{
            _id:deletedUser._id,
            FirstName:deletedUser.FirstName,
            email:deletedUser.email
        }
    }))
})
