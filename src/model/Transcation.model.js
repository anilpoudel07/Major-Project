const transactionSchema = new Schema({
  txnId:         { type: String, required: true, unique: true },   // e.g. TXN-20251229-001A
  nfcCard:       { type: Schema.Types.ObjectId, ref: 'NfcCard', required: true },
  passenger:     { type: Schema.Types.ObjectId, ref: 'User' },
  trip:          { type: Schema.Types.ObjectId, ref: 'Trip' },

  tapIn: {
    time:        { type: Date, required: true },
    stop:        { type: Schema.Types.ObjectId, ref: 'Stop' },
    location:    { type: [Number], index: '2dsphere' }   // [lng, lat]
  },
  tapOut: {
    time:        Date,
    stop:        { type: Schema.Types.ObjectId, ref: 'Stop' },
    location:    { type: [Number], index: '2dsphere' }
  },

  fare:          { type: Number },    // calculated on tap-out
  status:        { 
    type: String, 
    enum: ['pending_exit', 'completed', 'no_tap_out', 'failed', 'refunded'],
    default: 'pending_exit'
  },
  offline:       { type: Boolean, default: false }   // generated on driver tablet
}, { timestamps: true });

transactionSchema.index({ txnId: 1 });
transactionSchema.index({ nfcCard: 1, status: 1 });
transactionSchema.index({ trip: 1 });
export const Transcation = new mongoose.model("Transcation",transactionSchema)