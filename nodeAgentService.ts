import { IExecutingBotFlow } from "../../interfaces/executingFlow.interface";
import { ToolExecutor } from "./toolExecutor";

import { ToolModel } from "../../models";

interface IAvailable {
  id: string;
  name: string;
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
  availableFunctions: IAvailable[];
  condition: any[];
  _id?: string;
}

interface ObjectId {
  $oid: string;
}

interface Parameter {
  key: string;
  validation: string;
  _id: ObjectId;
}

interface Header {
  key: string;
  value: string;
}

interface DynamicParam {
  key: string;
  location: string;
  required: boolean;
  validation?: string;
}

interface ToolConfig {
  apiName: string;
  method: string;
  baseUrl: string;
  apiEndpoint: string;
  headers: Header[];
  dynamicParams: DynamicParam[];
  tools: any[]; // यदि tools की structure पता हो तो specific type दें
}

export interface AvailableTool {
  _id: ObjectId;
  toolName: string;
  toolDescription: string;
  parameters: Parameter[];
  companyId: string;
  botId: string;
  toolConfig: ToolConfig;
  toolType: string;
  __v: number;
}

export async function fetchAvailableTool(toolId: string) {
  try {
    const availableTool = await ToolModel.findById({ _id: toolId }).lean();

    return availableTool;
  } catch (error) {
    console.log("error during fetching available tools for the botId");
  }
}

export async function nodeAgent(
  node: FlowNode,
  query: string,
  executingFlow: IExecutingBotFlow,
  sessionId: string
): Promise<string | number | undefined> {
  console.log("Available functions:", node.availableFunctions[0]);

  try {
    // Fetch the tool using the ID from the first available function.
    const toolId = node.availableFunctions?.[0].id;
    if (!toolId) {
      console.error("❌ Error: No tool ID found in the node.");
      return "Error";
    }
    const tool = await fetchAvailableTool(toolId);
    const executingFlowId = executingFlow.id;
    const result = await ToolExecutor.executeTools(
      tool,
      executingFlowId,
      query,
      node,
      sessionId
    );

    if (result === undefined) {
      throw new Error("ToolExecutor.executeTools returned undefined");
    }

    return result;
  } catch (error) {
    console.error("❌ Error in nodeAgent:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return "Error";
  }
}
