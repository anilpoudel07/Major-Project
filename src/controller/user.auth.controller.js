import jwt from "jsonwebtoken"
import {asyncHandler} from "../utils/asyncHandler.js";
import {User} from "../model/user.model.js";
import z from "zod";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

 const accessToken = user.generateAccessToken();    
    const refreshToken = user.generateRefreshToken();

 
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };

  } catch (error) {
    console.error("Token generation error:", error);
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh tokens"
    );
  }
};


const registerUser = asyncHandler(async(req,res)=>{
    const {nid,FirstName,email,phone,password,user_type} = req.body;
    if (email === process.env.ADMIN_EMAIL) {
 
  const admin = await User.create({
    email,
    password,
    FirstName: "Super Admin",
    nid: "ADMIN-000000",
    phone: "42",
    user_type: ["admin"],
    isVerified: true,
  });
  return res.status(201).json(new ApiResponse(admin, "Super Admin created"));
}


   const existedUser = await User.findOne({
   $or: [{ nid }, { email }, { phone }]
   })
   if (existedUser) {
   
    if (existedUser.nid === nid) {
      throw new ApiError(409, "This National ID is already registered");
    }
    if (existedUser.email === email) {
      throw new ApiError(409, "This email is already registered");
    }
    if (existedUser.phone === phone) {
      throw new ApiError(409, "This phone number is already registered");
    }
  }

   const user = await User.create({
    nid,
   FirstName,
    email,
    password,
    phone

   })
   const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
   );
if(!createdUser){
    throw new ApiError(500,"Something went wrong while registering the user");

}
return res
.status(201)
.json(new ApiResponse(200,createdUser,"User register successfully"));
});


const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate( 
req.user._id,
{
    $set:{
        refreshToken:undefined,
    }
},{
    new:true
}
    )
    const options = {
        httpOnly:true,
        secure:process.env.NODE_ENV==="production"
    }
    return res
    .status(200)
    .clearCookie("refreshToken",options)
    .clearCookie("acessToken",options)
    .json(new ApiResponse(200,{},"User logged out successfully"))
});

const refreshAcessToken = async(req , res)=>{
const incomingRefreshToken = req.cookies.refreshToken||req.body.refreshToken
if(!incomingRefreshToken){
    throw new ApiError(401,"Refresh toke in required");
}
try {
   const decodedToken =  jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
const user = await User.findById(decodedToken?._id);
if(!user){
    throw new ApiError(401,"Invalid refresh Token");
}
if(incomingRefreshToken !==user?.refreshToken )
{
    throw new ApiError(401,"Invalid refresh Token ");
}
const options = {
    httpOnly:true, 

}
const {accessToken, refreshToken:newRefreshToken} = await generateAcessandRefreshToken(user._id)
return res
.status(200)
.cookies("acesssToken:",accessToken,options,)
.cookies("refreshToken:",newRefreshToken,options)
.json(
    new ApiResponse(200,{accessToken,refreshToken:newRefreshToken},"Acess token refreshed sucessfully")
)
} catch (error) {
    throw new ApiError(500,"Something went wrong while refreshing acess token")
}
}
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "User not found");

  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect)
    throw new ApiError(401, "Invalid password. Try again");

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user._id);

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser,
          token:accessToken,
          refreshToken:refreshToken
         },
        "User logged in successfully"
      )
    );
});


export {
    refreshAcessToken,
    logoutUser,
    registerUser,
    loginUser

}