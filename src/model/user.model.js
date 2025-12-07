import { mongoose, Schema } from "mongoose";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
const userSchema = new Schema(
  {
    nid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: [
        /^\d{10,12}$|^\d{2}-\d{2}-\d{2}-\d{6}$/,
        "Invalid Nepal National ID  format",
      ],
    },

    FirstName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    //   meta:{
    //   dob:Date,
    //   gender:{type:String,
    //     enum:["Male","Female","Others"],
    //       },
    //   address:String,
    //   bloodGroup:String,
    //   citizenshipNo:String,
    //   issuedDistrict:String
    //   },
    phone: {
      type: String,
      required: true,
      unique: true,
      match: [
        /98\d{8}$/,
        "Please enter a valid Nepali mobile number (98xxxxxxxx}",
      ],
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    user_type: {
      type: [String],
      enum: ["passenger", "driver", "operator", "admin"],
      required: true,
    },
    // default_card:{
    //  type:mongoose.Schema.Types.ObjectId,
    // ref:"NfcCard",
    //  default:null,
    //   },
    default_card: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NfcCard",
      default: null,
    },
    isVerified: { type: Boolean, default: false },
    onBoard: { type: Boolean, default: false },

    password: { type: String, required: true, unique: true },
    refreshToken: { type: String },
  },
  {
    timestamps: true,
  }
);
//Indexes for preformance
userSchema.index({ nid: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ user_type: 1 });
userSchema.index({ "meta.dob": 1 });
userSchema.virtual("isDriver").get(function () {
  return this.user_type.includes("driver");
});
//Checking if use is driver, Owner , admin
userSchema.virtual("isOwner").get(function () {
  return this.user_type.includes("owner");
});
userSchema.virtual("isAdmin").get(function () {
  return this.user_type.includes("admin");
});

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
  if (this.email === process.env.ADMIN_EMAIL) {
    this.user_type = "admin";
  }
});

// In src/model/user.model.js

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      nid: this.nid,
      user_type: this.user_type,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1h",
    }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    }
  );
};
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

export const User = new mongoose.model("User", userSchema);
