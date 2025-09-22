import mongoose, { Schema } from "mongoose";



// 🔹 Available Functions Schema
const AvailableFunctionSchema = new Schema({
   id: { type: String },
  name: { type: String },
});

// 🔹 Flow Schema
const NodeSchema = new Schema({
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
  nodeState:{
    type:String,
    enum:['Running','Completed'],
    default:'Running'
  }
});
const ExecutingBotFlowSchema = new Schema({
  flowName: { type: String },
  nodes: { type: [NodeSchema] },
  flowDescription: { type: String },
  messages:[{
    message:{type:String},
    owner:{type:String,enum:['User','System']}
  }],
  userId:{type:String,required:true},
  companyId: { type: String, required: true },
  botId: { type: String, required: true },
  flowState: {
    type: String,
    enum: ["start", "running", "completed", "abort"],
  },
  variables: [
    {
      state: { type: Boolean, default: false },
      userAgentName: { type: String },
      tool:{type:String},
      functionParameters: [
        {
          variableName: { type: String },
          validation:{type:Schema.Types.Mixed, required:true},
          variableValue: { type: String },
          received: { type: Boolean, default: false },
        }
      ]
    }
  ],
    created: {
    type: Date,
    default: Date.now,
  },
});

// Model
export const ExecutingBotFlow = mongoose.model("ExecutingBotFlow", ExecutingBotFlowSchema);
