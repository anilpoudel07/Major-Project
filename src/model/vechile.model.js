
import mongoose, { Schema } from "mongoose";

const busSchema = new Schema(
  { 
    PlateNo:{
      type: String,
    },
     driver:{
      type:Schema.Types.ObjectId,
      ref:"driver"
    },

    operator: {
      type: Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
    },

    currentLocation: [
      {
        lat: Number,
        lng: Number,
      },
    ],

    last_seen: Date,
  },
  { timestamps: true }
);

busSchema.index({ vehicle_no: 1 });

export const Bus = mongoose.model("Bus", busSchema);
