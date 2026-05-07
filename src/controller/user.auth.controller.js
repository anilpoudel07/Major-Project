import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../model/user.model.js";
import { Operator } from "../model/operator.model.js";
import { Driver } from "../model/driver.model.js";
import { Bus } from "../model/vechile.model.js";
import ApiError from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// PRIVATE HELPERS

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
});

const checkUserDuplicates = async ({ nid, email, phone }) => {
  const existedUser = await User.findOne({ $or: [{ nid }, { email }, { phone }] });
  if (!existedUser) return;
  if (existedUser.nid === nid)
    throw new ApiError(409, "This National ID is already registered");
  if (existedUser.email === email)
    throw new ApiError(409, "This email is already registered");
  if (existedUser.phone === phone)
    throw new ApiError(409, "This phone number is already registered");
};

// REGISTER — Passenger
// POST /api/user/register
const registerUser = asyncHandler(async (req, res) => {
  const { nid, FirstName, email, phone, password } = req.body;

  if (email === process.env.ADMIN_EMAIL) {
    const admin = await User.create({
      email, password,
      FirstName: "Super Admin",
      nid: "ADMIN-000000",
      phone: "9800000000",
      user_type: ["admin"],
      isVerified: true,
    });
    const safeAdmin = await User.findById(admin._id).select("-password -refreshToken");
    return res.status(201).json(new ApiResponse(201, safeAdmin, "Super Admin created"));
  }

  await checkUserDuplicates({ nid, email, phone });

  const user = await User.create({
    nid, FirstName, email, password, phone,
    user_type: ["passenger"],
  });

  const createdUser = await User.findById(user._id).select("-password -refreshToken");
  if (!createdUser)
    throw new ApiError(500, "Something went wrong while registering the user");

  return res.status(201).json(new ApiResponse(201, createdUser, "User registered successfully"));
});

// LOGIN — Passenger / Admin
// POST /api/user/login
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    throw new ApiError(400, "Email and password are required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "No account found with this email");

  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect)
    throw new ApiError(401, "Incorrect password. Please try again");

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
  const options = cookieOptions();

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "Logged in successfully"));
});

// LOGOUT — shared by all roles
// POST /api/*/logout
const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } }, { new: true });
  const options = cookieOptions();
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "Logged out successfully"));
});

// REGISTER — Driver
// POST /api/driver/register
const registerDriver = asyncHandler(async (req, res) => {
  const {nid, FirstName, email, phone,password, license_number, license_expiry } = req.body;

  if (!license_number?.trim())
    throw new ApiError(400, "Driver license number is required");
  if (!license_expiry)
    throw new ApiError(400, "License expiry date is required");

  const expiryDate = new Date(license_expiry);
  if (isNaN(expiryDate.getTime()))
    throw new ApiError(400, "Invalid license expiry date format");
  if (expiryDate <= new Date())
    throw new ApiError(400, "Driver license is already expired");
 
  const existingLicense = await Driver.findOne({ licenseNumber: license_number.toUpperCase() });
  if (existingLicense)
    throw new ApiError(409, "This driver license number is already registered");

  const user = await User.create({
    nid, FirstName, email, password, phone,
    user_type: ["driver"],
  });

  let driver;
  try {
    driver = await Driver.create({
      user: user._id,
      licenseNumber: license_number,
      licenseExpiry: expiryDate,
    });
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    throw new ApiError(500, "Failed to create driver profile. Registration rolled back.");
  }

  const createdUser = await User.findById(user._id).select("-password -refreshToken");

  return res.status(201).json(
    new ApiResponse(201, { user: createdUser, driver }, "Driver registered successfully")
  );
});

// LOGIN — Driver
// POST /api/driver/login
// Body: { email, password }
const loginDriver = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    throw new ApiError(400, "Email and password are required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "No driver account found with this email");

  if (!user.user_type.includes("driver"))
    throw new ApiError(403, "This account is not registered as a driver");

  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect)
    throw new ApiError(401, "Incorrect password. Please try again");

  // Fetch driver profile + assigned bus
  const driverDoc = await Driver.findOne({ user: user._id })
    .populate("operator", "companyName contact.phone contact.email")
    .populate("assignedBus", "plateNumber busType status maxCapacity currentOccupancy");

  if (!driverDoc)
    throw new ApiError(404, "Driver profile not found. Please contact support.");

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
  const options = cookieOptions();

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, driver: driverDoc, accessToken, refreshToken },
        "Driver logged in successfully"
      )
    );
});

// GET DRIVER PROFILE
// GET /api/driver/profile
// Protected: verifyJWT
const getDriverProfile = asyncHandler(async (req, res) => {
  if (!req.user.user_type.includes("driver"))
    throw new ApiError(403, "Access denied. Driver role required.");

  const driverDoc = await Driver.findOne({ user: req.user._id })
    .populate("operator", "companyName contact.phone contact.email")
    .populate("assignedBus", "plateNumber busType status maxCapacity currentOccupancy");

  if (!driverDoc)
    throw new ApiError(404, "Driver profile not found");

  return res
    .status(200)
    .json(new ApiResponse(200, { user: req.user, driver: driverDoc }, "Driver profile fetched successfully"));
});

// REGISTER — Operator
// POST /api/operator/register
const registerOperator = asyncHandler(async (req, res) => {
const { nid, FirstName, email, phone, password, company_name } = req.body;
  if (!company_name?.trim())
    throw new ApiError(400, "Company name is required");
  await checkUserDuplicates({ nid, email, phone });

  const user = await User.create({
    nid,FirstName,email, password, phone,
    user_type: ["operator"],
  });

  let operator;
  try {
    operator = await Operator.create({
      owner: user._id,
      companyName: company_name,
//      licenseNumber: license_number,
      contact: { phone, email },
    });
  } catch (err) {
    await User.findByIdAndDelete(user._id);
    throw new ApiError(500, "Failed to create operator profile. Registration rolled back.");
  }

  const createdUser = await User.findById(user._id).select("-password -refreshToken");

  return res.status(201).json(
    new ApiResponse(201, { user: createdUser, operator }, "Operator registered successfully")
  );
});

// LOGIN — Operator
// POST /api/operator/login
// Body: { email, password }
const loginOperator = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    throw new ApiError(400, "Email and password are required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "No operator account found with this email");

  if (!user.user_type.includes("operator"))
    throw new ApiError(403, "This account is not registered as an operator");

  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect)
    throw new ApiError(401, "Incorrect password. Please try again");

  // Fetch operator profile + bus list
  const operatorDoc = await Operator.findOne({ owner: user._id })
    .populate("buses", "plateNumber busType status driver");

  if (!operatorDoc)
    throw new ApiError(404, "Operator profile not found. Please contact support.");

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
  const options = cookieOptions();

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, operator: operatorDoc, accessToken, refreshToken },
        "Operator logged in successfully"
      )
    );
});

// GET OPERATOR PROFILE
// GET /api/operator/profile
// Protected: verifyJWT
const getOperatorProfile = asyncHandler(async (req, res) => {
  if (!req.user.user_type.includes("operator"))
    throw new ApiError(403, "Access denied. Operator role required.");

  const operatorDoc = await Operator.findOne({ owner: req.user._id })
    .populate("buses", "plateNumber busType status driver currentOccupancy maxCapacity");

  if (!operatorDoc)
    throw new ApiError(404, "Operator profile not found");

  return res
    .status(200)
    .json(new ApiResponse(200, { user: req.user, operator: operatorDoc }, "Operator profile fetched successfully"));
});

// ═══════════════════════════════════════════════════════════
// REFRESH ACCESS TOKEN
// POST /api/auth/refresh-token
// ═══════════════════════════════════════════════════════════
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!incomingRefreshToken)
    throw new ApiError(401, "Refresh token is required");

  try {
    const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decodedToken?._id);
    if (!user) throw new ApiError(401, "Invalid refresh token — user not found");
    if (incomingRefreshToken !== user.refreshToken)
      throw new ApiError(401, "Refresh token is expired or already used");

    const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshToken(user._id);
    const options = cookieOptions();

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(new ApiResponse(200, { accessToken, refreshToken: newRefreshToken }, "Access token refreshed successfully"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "Invalid or expired refresh token");
  }
});

export {
  registerUser,
  loginUser,
  logoutUser,
  registerDriver,
  loginDriver,
  getDriverProfile,
  registerOperator,
  loginOperator,
  getOperatorProfile,
  refreshAccessToken,
};







/*  
import {asyncHandler} from "../utils/asyncHandler.js";
import {User} from "../model/user.model.js";
import {Operator} from "../model/operator.model.js";
import {Bus} from "../model/vechile.model.js";
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
    phone,
    user_type: user_type || ["passenger"]

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

const registerOperator = asyncHandler(async(req,res)=>{
    const {email,phone,password,companyName} = req.body;

   const existedUser = await User.findOne({
   $or: [ { email }, { phone }]
   })
   if (existedUser) {
    
    if (existedUser.email === email) {
      throw new ApiError(409, "This email is already registered");
    }
    if (existedUser.phone === phone) {
      throw new ApiError(409, "This phone number is already registered");
    }
  }

  
   const operator = await Operator.create({
    companyName,
    email, 
    phone
   });

   const createdOperator = await User.findById(operator._id).select(
    "-password -refreshToken"
   );
if(!createdOperator){
    throw new ApiError(500,"Something went wrong while registering the operator");
}
return res
.status(201)
.json(new ApiResponse(200,{user: createdOperator, operator},"Operator registered successfully"));
});

const registerVehicle = asyncHandler(async(req,res)=>{
    const {PlateNo, driverId} = req.body;

    const operatorDoc = await Operator.findOne({owner: req.user._id});
    if (!operatorDoc) {
      throw new ApiError(403, "No operator found for this user");
    }

    const bus = await Bus.create({
      PlateNo,
      driver: driverId || null,
      operator: operatorDoc._id
    });

    if(!bus){
        throw new ApiError(500,"Something went wrong while registering the vehicle");
    }
    return res
    .status(201)
    .json(new ApiResponse(200,bus,"Vehicle registered successfully"));
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
    .clearCookie("accessToken",options)
    .json(new ApiResponse(200,{},"User logged out successfully"))
});

const refreshAccessToken = async(req , res)=>{
const incomingRefreshToken = req.cookies.refreshToken||req.body.refreshToken
if(!incomingRefreshToken){
    throw new ApiError(401,"Refresh token is required");
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
const {accessToken, refreshToken:newRefreshToken} = await generateAccessAndRefreshToken(user._id)
return res
.status(200)
.cookie("accessToken",accessToken,options,)
.cookie("refreshToken",newRefreshToken,options)
.json(
    new ApiResponse(200,{accessToken,refreshToken:newRefreshToken},"Access token refreshed successfully")
)
} catch (error) {
    throw new ApiError(500,"Something went wrong while refreshing access token")
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
    refreshAccessToken,
    logoutUser,
    registerUser,
    loginUser,
    registerOperator,
    registerVehicle

}
*/





