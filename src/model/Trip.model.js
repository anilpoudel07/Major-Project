const tripSchema = new Schema({
  tripCode:      { type: String, unique: true },   // TRP-20251229-A001
  driver:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  vehicle:       { type: Schema.Types.ObjectId, ref: 'Vehicle' },
  route:         { type: Schema.Types.ObjectId, ref: 'Route' },
  operator:      { type: Schema.Types.ObjectId, ref: 'Operator' },

  status:        { type: String, enum: ['scheduled','running','ended','cancelled'], default: 'scheduled' },
  startTime:     Date,
  endTime:       Date,

  // Live list of passengers currently on board
  passengersOnBoard: [{
    passenger:   { type: Schema.Types.ObjectId, ref: 'User' },
    nfcCard:     { type: Schema.Types.ObjectId, ref: 'NfcCard' },
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction' },
    tappedInAt:  Date
  }],

  offlineMode:   { type: Boolean, default: false }
}, { timestamps: true });

tripSchema.index({ tripCode: 1 });
tripSchema.index({ driver: 1, status: 1 });
export const Trip = new mongoose.model("Trip",tripSchema);