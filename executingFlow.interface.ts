import { Document } from "mongoose";

export interface IParameter {
  key: string;
  validation: any;
  value: any;
  received: boolean;
}

export interface IFunctionParameter {
  variableName?: string | null;
  variableValue?: string | null;
  received?: boolean;
}

export interface IVariable {
  state?: boolean;
  userAgentName?: string | null;
  tool?: string | null;
  functionParameters?: IFunctionParameter[] | null;
}

export interface IAvailableFunction {
  id?: string | null;
  name?: string | null;
}

export interface ICondition {
  conditionType?: "OnAgentCompletion" | "OnAgentAnswer" | "CUSTOM" | null;
  conditionValue?: string | null;
  executeAgent?: string | null;
  executeUserAgent?: string | null;
  answerFromUserAgentName?: string | null;
  completionFromUserAgentName?: string | null;
}
// 🔹 6. Flow Interface
export interface INode {
  userAgentName: string;
  condition?: ICondition[] | null;
  availableFunctions?: IAvailableFunction[] | null;
  nodeState: "Running" | "Completed";
}
export interface IMesssage {
  message: string;
  owner: "User" | "System";
}

export interface IExecutingBotFlow extends Document {
  flowName?: string | null;
  nodes?: INode[] | null;
  flowDescription?: string | null;
  messages: IMesssage[] | null;
  userId: string;
  companyId: string;
  botId: string;
  flowState: "start" | "running" | "completed" | "abort";
  variables?: IVariable[] | null;
}
