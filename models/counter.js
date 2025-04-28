import { Schema, model } from "mongoose";

const counterSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: Number,
    default: 1000 // Start listing numbers from 1000
  }
});

export default model("Counter", counterSchema); 