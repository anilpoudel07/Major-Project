import mongoose, { Schema } from "mongoose";

const tripSchema = new Schema(
  {
    passengerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    busId: {
      type: Schema.Types.ObjectId,
      ref: "Bus",
      required: true,
    },

    // ── NEW: copied from bus.operator at trip creation time ──
    operator: {
      type: Schema.Types.ObjectId,
      ref: "Operator",
      required: true,
    },

    // ── NEW: copied from bus.driver at trip creation time ──
    // null if bus has no driver assigned at tap time
    driver: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },

    entryLocation: {
      lat: { type: Number, required: true },
      lon: { type: Number, required: true },
    },

    exitLocation: {
      lat: { type: Number },
      lon: { type: Number },
    },

    entryTime: {
      type: Date,
      required: true,
      default: Date.now,
    },

    exitTime: {
      type: Date,
    },

    fare: {
      type: Number,
      default: null,
    },

    completed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// existing indexes
tripSchema.index({ passengerId: 1, completed: 1 });
tripSchema.index({ busId: 1 });
tripSchema.index({ passengerId: 1, busId: 1, completed: 1 });

// ── NEW indexes for operator/driver queries ──
tripSchema.index({ operator: 1 });                    // all trips under an operator
tripSchema.index({ driver: 1 });                      // all trips by a driver
tripSchema.index({ operator: 1, completed: 1 });      // operator revenue queries
tripSchema.index({ operator: 1, createdAt: -1 });     // operator trip history sorted by date

export const Trip = mongoose.model("Trip", tripSchema);





