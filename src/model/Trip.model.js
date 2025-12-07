import mongoose, { Schema } from "mongoose";

const tripSchema = new Schema(
  {
    passengerId: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },

    busId: { 
      type: Schema.Types.ObjectId, 
      ref: "Bus", 
      required: true 
    },

    entryLocation: {
      lat: { type: Number, required: true },
      lon: { type: Number, required: true }
    },

    exitLocation: {
      lat: { type: Number },
      lon: { type: Number }
    },

    entryTime: {
      type: Date,
      required: true,
      default: Date.now
    },

    exitTime: {
      type: Date
    },

    fare: { 
      type: Number,
      default: null
    }, 

    completed: {
      type: Boolean,
      default: false
    },
    
  },
  { timestamps: true }
);

tripSchema.index({ passengerId: 1, completed: 1 });
tripSchema.index({ busId: 1 });
tripSchema.index({ passengerId: 1, busId: 1, completed: 1 });

export const Trip = mongoose.model("Trip", tripSchema);
