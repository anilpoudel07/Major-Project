// import {mongoose,Schema} from "mongoose";

// import bcrypt from "bcrypt";
// import jwt from "jsonwebtoken";
// const userSchema = new Schema({
//    nid:{
//     type:String, 
//     unique:true, 
//     sparse:true,
//     trim:true, 
//     uppercase:true, 
// match: [/^\d{10,12}$|^\d{2}-\d{2}-\d{2}-\d{6}$/, "Invalid Nepal National ID  format"]
//    },

//      FirstName :{
//         type:String, 
//         unique:true,
//         trim:true,
//         minlength:3, 
//         maxlength:50,
//         sparse:true,

//      },
//    //   meta:{
//    //   dob:Date, 
//    //   gender:{type:String, 
//    //     enum:["Male","Female","Others"],
//    //       },
//    //   address:String, 
//    //   bloodGroup:String, 
//    //   citizenshipNo:String, 
//    //   issuedDistrict:String
//    //   },
//      phone:{type:String,
//          unique:true,
//          match:[/98\d{8}$/,"Please enter a valid Nepali mobile number (98xxxxxxxx}"],
//          sparse:true
//      },

//      email:{type:String, 
//         required:true, 
//         unique:true,
//         trim:true, 
//         lowercase:true, 
//         sparse:true, 
// match:[/^\S+@\S+\.\S+$/,"Please enter a valid email"]

//      },
//      user_type:{
//         type:[String],
//         enum:["passenger","driver","operator","admin"]
//      },
//     // default_card:{
//       //  type:mongoose.Schema.Types.ObjectId, 
//        // ref:"NfcCard",
//       //  default:null, 
//   //   },
//   default_card: {
//   type: mongoose.Schema.Types.ObjectId,
//   ref: "NfcCard",
//   default: null
// },
//      isVerified:{type:Boolean, default:false},


//      password:{type:String, required:true, unique:true},
//   refreshToken:{type:String}

// },{
//     timestamps:true
// })
// //Indexes for preformance
// userSchema.index({nid:1});
// userSchema.index({phone:1});
// userSchema.index({user_type:1});
// userSchema.index({"meta.dob":1})
// userSchema.virtual("isDriver").get(function(){
//     return this.user_type.includes("driver")
// })
// //Checking if use is driver, Owner , admin 
// userSchema.virtual("isOwner").get(function(){
//     return this.user_type.includes("owner")
// });
// userSchema.virtual("isAdmin").get(function(){
//     return this.user_type.includes("admin")
// });

// userSchema.pre("save", async function () {
//    if (!this.isModified("password")) return;
//    this.password = await bcrypt.hash(this.password, 10);
// });

// userSchema.pre("validate", function () {
//   if (this.email === process.env.ADMIN_EMAIL) {
//     this.$skipValidation = true;
//     return;
//   }
//   next();
// });





// userSchema.methods.generateAccessToken = function () {
//   return jwt.sign(
//     {
//       _id: this._id,
//       email: this.email,
//       nid: this.nid,
//       user_type: this.user_type
//     },
//     process.env.ACCESS_TOKEN_SECRET,
//     {
//       expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1h"
//     }
//   );
// };

// userSchema.methods.generateRefreshToken = function () {
//   return jwt.sign(
//     {
//       _id: this._id
//     },
//     process.env.REFRESH_TOKEN_SECRET,
//     {
//       expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d"
//     }
//   );
// };
// userSchema.methods.isPasswordCorrect = async function (password){
//    return await bcrypt.compare(password, this.password);
// }

// export const User = new mongoose.model("User",userSchema)
// src/model/user.model.js

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    nid: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
    },
    FirstName: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    user_type: {
      type: [String],
      enum: ["passenger", "driver", "operator", "admin"],
      default: ["passenger"],
    },
  defaultNfcCard: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "NfcCard",
  default: null,
},
    isVerified: {
      type: Boolean,
      default: false,
    },
    refreshToken: String,
  },
  { timestamps: true }
);

// ONLY ONE pre("save") hook — this is the correct way
userSchema.pre("save", async function () {
  // ADMIN BYPASS
  if (this.email === process.env.ADMIN_EMAIL) {
    this.FirstName = "System Admin";
    this.nid = "ADMIN000000";
    this.phone = "9800000000";
    this.isVerified = true;
    this.user_type = ["admin"];
    
  } else {
    // NORMAL VALIDATION
    if (!this.nid || !/^\d{10,12}$|^\d{2}-\d{2}-\d{2}-\d{6}$/.test(this.nid)) {
      throw new Error("Invalid Nepal National ID format");
    }
    if (!this.phone || !/^98\d{8}$/.test(this.phone)) {
      throw new Error("Invalid Nepali mobile number");
    }
    if (!this.FirstName || this.FirstName.length < 3) {
      throw new Error("First name must be at least 3 characters");
    }
  }

  // PASSWORD HASH
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});


// Remove duplicate indexes (you had both in schema and schema.index())
userSchema.index({ nid: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

// Token methods
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { _id: this._id, email: this.email, user_type: this.user_type },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "1h" }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ _id: this._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

export const User = mongoose.model("User", userSchema);