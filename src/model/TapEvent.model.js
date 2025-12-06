// models/tapEvent.model.js

import mongoose, { Schema } from "mongoose";

const tapEventSchema = new Schema(
  {
    card_uid: { type: Schema.Types.ObjectId, ref:"NfcCard" },

    bus: { type: Schema.Types.ObjectId, ref: "Bus" },

    event_type: {
      type: String,
      enum: ["entry", "exit"],
      required: true
    },

    lat: Number,
    lng: Number,

    timestamp: { type: Date, default: Date.now },

    synced: { type: Boolean, default: false },

    device_signature: String // verifies authenticity
  },
  { timestamps: true }
);

tapEventSchema.index({ card_uid: 1 });
tapEventSchema.index({ event_type: 1 });

export const TapEvent = mongoose.model("TapEvent", tapEventSchema);
