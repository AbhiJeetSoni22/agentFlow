export interface IAgentFlow {
 
    agentName: string;
    displayAgentName: string;
    userAgentName: string;
    output: number;
    agentId?: string;
    hardCodeFunction?: string | null;
    agentPrompt: string;
    userPrompt: string;
    agentModel: string;
    availableFunctions?: string[];
    grabFunctionFrom?: string;
    condition: {
      conditionType: "OnAgentCompletion" | "OnAgentAnswer";
      conditionValue?: string;
      executeAgent?: string | null;
      executeUserAgent?: string | null;
      answerFromUserAgentName?: string | null;        // required if OnAgentAnswer
      completionFromUserAgentName?: string | null;    // required if OnAgentCompletion
    }[];
  }[];

// Condition interface
export interface Condition {
  isRunnable: boolean;
  executeUserAgent: string;
}
export interface FlowNode {
  agentName: string;
  displayAgentName: string;
  userAgentName: string;
  output: number;
  agentPrompt: string;
  agentModel: string;
  hardCodeFunction?: string | null;
  grabFunctionFrom?: string | null;
  availableFunctions: string[];
  condition: Condition[];
  _id?: string;
}

export interface AvailableTools{
  toolId :string;
  toolName: string;
}

export   interface Tools {
  sum(): number;
  division(): number;
  multiply(): number;
}