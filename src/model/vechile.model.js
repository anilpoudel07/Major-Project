// models/bus.model.js

// models/bus.model.js

import mongoose, { Schema } from "mongoose";

const busSchema = new Schema(
  {
    vehicle_no: {
      type: String,
      required: true,
      unique: true,
    },
    liceceNo: {
      type: String,
      match: "/^[0-7]{2}-[0-9]{2}-d{5,8}$",
    },

    operator: {
      type: Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
    },

    gps: [
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
