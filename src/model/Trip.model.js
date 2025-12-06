

import mongoose, { Schema } from "mongoose";

const tripSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },

    card: { type: Schema.Types.ObjectId, ref: "NfcCard" },

    bus: { type: Schema.Types.ObjectId, ref: "Bus" },

    entry_event: { type: Schema.Types.ObjectId, ref: "TapEvent" },
    exit_event: { type: Schema.Types.ObjectId, ref: "TapEvent" },

    distance_m: { type: Number, default: 0 },

    fare: { type: Number, default: 0 }, 

    status: {
      type: String,
      enum: ["completed", "incomplete"],
      default: "incompleted"
    },
    entry_lat:{
      type:Number
    },
    entry_lon:{
      type:Number
    },
    exit_lat:{
      type:Number
    },
    exit_lon:{
      type:Number
    }
    
  },
  { timestamps: true }
);

tripSchema.index({ user: 1 });
tripSchema.index({ card: 1 });

export const Trip = mongoose.model("Trip", tripSchema);
