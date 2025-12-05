const vehicleSchema = new Schema({
  plateNumber: { type: String, required: true, unique: true },
  model: String,
  operator: { type: Schema.Types.ObjectId, ref: 'Operator' },
  currentDriver: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
export const Vehicle = new mongoose.model('Vehicle', vehicleSchema);

const operatorSchema = new Schema({ name: String, isActive: Boolean }, { timestamps: true });
export const Operator =new model('Operator', operatorSchema);

const stopSchema = new Schema({
  name: String,
  location: { type: { type: String, enum: ['Point'] }, coordinates: [Number] }
}, { timestamps: true });
stopSchema.index({ location: '2dsphere' });
export const Stop = new mongoose.model('Stop', stopSchema);

const routeSchema = new Schema({
  code: String,
  name: String,
  stops: [{ type: Schema.Types.ObjectId, ref: 'Stop' }],
  fareTable: { type: Schema.Types.Mixed }   
}, { timestamps: true });
export const Route  = new mongoose.model("Route",routeSchema)