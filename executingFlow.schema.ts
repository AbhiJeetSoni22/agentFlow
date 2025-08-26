import mongoose, { Schema } from "mongoose";

// 🔹 Parameters Schema
const ParameterSchema = new Schema({
  key: { type: String, required: true },
  validation: { type: Schema.Types.Mixed },
  value:{type:Schema.Types.Mixed, default:null}
});



// 🔹 Available Functions Schema
const AvailableFunctionSchema = new Schema({
funId: { type: String },
  funName: { type: String },
  parameters: { type: [ParameterSchema], required: true },
  toolConfig: { type: Schema.Types.Mixed }, 
});

// 🔹 Flow Schema
const FlowSchema = new Schema({
  userAgentName: { type: String, required: true },
  condition: [
        {
          conditionType: {
            type: String,
            enum: ["OnAgentCompletion", "OnAgentAnswer", "CUSTOM"],
          },
          conditionValue: { type: String, default: undefined },
          executeAgent: { type: String, default: null },
          executeUserAgent: { type: String, default: null },
          answerFromUserAgentName: { type: String, default: null },
          completionFromUserAgentName: { type: String, default: null },
        },
      ],
  availableFunctions: { type: [AvailableFunctionSchema] },
});

// 🔹 Executing Bot Flow Schema
const ExecutingBotFlowSchema = new Schema({
  flowName: { type: String },
  flow: { type: [FlowSchema] },
  flowDescription: { type: String },
  userQuery:{type:String ,required :true},
  companyId: { type: String, required: true },
  botId: { type: String, required: true },
  flowState: {
    type: String,
    enum: ["start", "running", "completed", "abort"],
  },
});

// Model
export const ExecutingBotFlow = mongoose.model("ExecutingBotFlow", ExecutingBotFlowSchema);
