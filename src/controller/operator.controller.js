import { asycnHandler, asyncHandler } from "../utils/asyncHandler.js";
import {Bus} from "../model/vechile.model.js";
import mongoose from "mongoose";
import { Operator } from "../model/operator.model.js";
import ApiError from "../utils/ApiError.js";
const getBuses = asyncHandler(async (req, res) => {
  const operator = await Operator.findOne({
    owner: req.user._id
  }
  );
  if (!operator) throw new ApiError(404, "Operator not found");
  const buses = await Bus.find({ owner: operator._id }).select("busNumber currentLocationstatus");
  return res.status(200).json(new ApiResponse(200, buses, "Buses fetched successfully"))
});

const addBus = asyncHandler(async (req, res) => {
  const { PlateNo } = req.body;
  const operator = await Operator.findOne({ owner: req.user._id });
  if (!operator) throw new ApiError(404, "Operator not found");
  const existingBus = await Bus.findOne({ PlateNo });
  if (existingBus) throw new ApiError(409, "Bus number already exist");
  const bus = await Bus.create({ PlateNo, ownwer: operator._id });
  return res.status(201).json(new ApiResponse(201, bus, "Bus added successfully"));
});

const removeBus = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const operator = await operator.findOne({ owner: req.user._id });
  if (!operator) throw new ApiError(404, "Operator not found");
  const bus = await Bus.findOneAndDelete({ _id: busId, owner: operator._id });
  return res.status(200).json(new ApiResponse(200, bus, "Bus removed successfully"));

})
const getBusTranscations = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const operator = await Operator.findOne({ owner: req.user._id });
  if (!operator) throw new ApiError(404, "Operator not found");
  const bus = await Bus.findOne({ _id: busId, owner: operator._id });
})

