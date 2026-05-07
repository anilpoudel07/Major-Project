import mongoose, { Schema } from "mongoose";

const driverSchema = new Schema(
  {
    // The User account this driver profile belongs to
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      // FIX: removed duplicate — index: true here AND driverSchema.index({ user: 1 }) below
      // is redundant and creates two indexes in MongoDB. Keeping it here only.
      index: true,
    },

    // The operator company this driver works under
    operator: {
      type: Schema.Types.ObjectId,
      ref: "Operator",
      default: null,
      index: true,
    },

    // The bus currently assigned to this driver (null = unassigned)
    assignedBus: {
      type: Schema.Types.ObjectId,
      ref: "Bus",
      default: null,
      index: true,
    },

    licenseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    licenseExpiry: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["available", "on_duty", "off_duty", "suspended"],
      default: "available",
      index: true,
    },

    totalTrips: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 5, min: 0, max: 5 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// FIX: removed driverSchema.index({ user: 1 }), ({ operator: 1 }), ({ status: 1 }), ({ assignedBus: 1 })
// All four were already declared via index: true in the schema above — duplicate indexes waste storage.
// Keeping only the compound index below which cannot be expressed inline.
driverSchema.index({ operator: 1, status: 1 });

export const Driver = mongoose.model("Driver", driverSchema);
