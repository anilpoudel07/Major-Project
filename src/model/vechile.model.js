import mongoose, { Schema } from "mongoose";

const busSchema = new Schema(
  {
    plateNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },

    // Operator company that owns this bus
    operator: {
      type: Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
      index: true,
    },

    // Driver currently assigned to this bus (null = unassigned)
    driver: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
      index: true,
    },

    busType: {
      type: String,
      enum: ["standard", "express", "luxury"],
      default: "standard",
    },

    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
    },

    currentOccupancy: {
      type: Number,
      default: 0,
      min: 0,
    },

    currentLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      timestamp: { type: Date, default: null },
    },

    status: {
      type: String,
      enum: ["idle", "running", "maintenance", "inactive"],
      default: "idle",
      index: true,
    },

    lastSeen: { type: Date, default: null },
    totalTrips: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 5, min: 0, max: 5 },
  },
  { timestamps: true }
);

busSchema.index({ operator: 1, status: 1 });
busSchema.index({ "currentLocation.timestamp": 1 });

export const Bus = mongoose.model("Bus", busSchema);
