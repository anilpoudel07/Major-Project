import mongoose, { Schema } from "mongoose";

const operatorSchema = new Schema(
  {
    // The User who owns/manages this operator account
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      // FIX: removed duplicate operatorSchema.index({ owner: 1 }) below — already indexed here.
      index: true,
    },

    companyName: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    contact: {
      phone: { type: String },
      email: { type: String, lowercase: true, trim: true },
    },

    // All buses belonging to this operator
    buses: [
      {
        type: Schema.Types.ObjectId,
        ref: "Bus",
      },
    ],

    // All drivers working under this operator
    drivers: [
      {
        type: Schema.Types.ObjectId,
        ref: "Driver",
      },
    ],

    totalBuses: { type: Number, default: 0 },
    activeBuses: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 5, min: 0, max: 5 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// FIX: removed operatorSchema.index({ owner: 1 }) and ({ isActive: 1 }) — both already indexed inline above.

export const Operator = mongoose.model("Operator", operatorSchema);
