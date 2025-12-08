

import mongoose, { Schema } from "mongoose";

const operatorSchema = new Schema(
  {
    name: { type: String, required: true },

    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    contact: {
      phone: String,
      email: String
    },

    address: String
  },
  { timestamps: true }
);

operatorSchema.index({ name: 1 });

export const Operator = mongoose.model("Operator", operatorSchema);
