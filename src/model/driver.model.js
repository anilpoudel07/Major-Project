import mongoose from "mongoose";
const driverSchema = new mongoose.Schema({
  busId:{
    type:Schema.Types.ObjectId,
    ref:"Bus",
    required:true,
  }, 
  driverName:{
    type:String, 
    required:true, 
    unique:true,
  },
  licenceNo:{
    type:String, 
    required:true
  }
})
export const  Driver = new mongoose.model("Driver", driverSchema);
