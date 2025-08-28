import { Document } from "mongoose";

// 🔹 1. Parameter Interface
export interface IParameter {
  key: string;
  validation:any;
  value: any;
  received: boolean;
}

// 🔹 2. Function Parameters (inside variables array)
export interface IFunctionParameter {
  variableName?: string | null;
  variableValue?: string | null;
  received?: boolean;
}

// 🔹 3. Variable Interface (matches variables array in schema)
export interface IVariable {
  state?: boolean;
  userAgentName?: string | null;
  tool?: string | null;
  functionParameters?: IFunctionParameter[] | null;
}

// 🔹 4. Available Function Interface
export interface IAvailableFunction {
  funId?: string | null;
  funName?: string | null;
}

// 🔹 5. Condition Interface
export interface ICondition {
  conditionType?: "OnAgentCompletion" | "OnAgentAnswer" | "CUSTOM" | null;
  conditionValue?: string | null;
  executeAgent?: string | null;
  executeUserAgent?: string | null;
  answerFromUserAgentName?: string | null;
  completionFromUserAgentName?: string | null;
}

// 🔹 6. Flow Interface
export interface INode{
  userAgentName: string;
  condition?: ICondition[] | null;
  availableFunctions?: IAvailableFunction[] | null;
  nodeState:'Running'|'Completed'
}
export interface IMesssage{
  message:string;
  owner:"User"|"System";
}
// 🔹 7. Main Executing Bot Flow Interface
export interface IExecutingBotFlow extends Document {
  flowName?: string | null;
  nodes?: INode[] | null;
  flowDescription?: string | null;
  messages:IMesssage[]|null;
  userId: string;
  companyId: string;
  botId: string;
  flowState: "start" | "running" | "completed" | "abort";
  variables?: IVariable[] | null;
}
