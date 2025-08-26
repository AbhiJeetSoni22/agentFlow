import { Document } from "mongoose";

// 🔹 1. Parameter Interface
export interface IParameter {
  key: string;
  validation?: any; // mongoose.Schema.Types.Mixed maps to any in TypeScript
}

// 🔹 2. Function Interface


// 🔹 3. Available Function Interface (nested within Flow)
export interface IAvailableFunction {
  funId?: string | null; // Allow null for optional string fields
  funName?: string | null; // Allow null for optional string fields
  parameters: IParameter[];
  toolConfig?: any; 
}

// 🔹 4. Condition Interface (common to both BotFlow and ExecutingBotFlow)
export interface ICondition {
  conditionType?: "OnAgentCompletion" | "OnAgentAnswer" | "CUSTOM" | null; // Null को भी स्वीकारें
  conditionValue?: string | null; // Allow null for optional string fields
  executeAgent?: string | null;
  executeUserAgent?: string | null;
  answerFromUserAgentName?: string | null;
  completionFromUserAgentName?: string | null;
}

// 🔹 5. Flow Interface (nested within ExecutingBotFlow)
export interface IFlow {
  userAgentName: string;
  condition?: ICondition[] | null; // Allow null for optional arrays
  availableFunctions?: IAvailableFunction[] | null; // Allow null for optional arrays
}

// 🔹 6. Main Executing Bot Flow Interface
export interface IExecutingBotFlow extends Document {
  flowName?: string | null; // Null को भी स्वीकारें
  flow?: IFlow[] | null; // Null को भी स्वीकारें
  flowDescription?: string | null; // Null को भी स्वीकारें
  companyId: string;
  botId: string;
  flowState?: "start" | "running" | "completed" | "abort";
}

