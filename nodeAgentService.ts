// nodeAgentService.ts

import { IAgentFlowState } from "../../interfaces/executingFlow.interface";
import { ToolExecutor, executeReactAgentNode, executeReplyAgentNode } from "./flowToolExecutor"; // executeReactAgentNode ko import kiya
import { ToolModel } from "../../models";
import { Socket } from "socket.io";
import { ReactAgentService } from "./reactAgentService";

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
  agentFlowId: string;
  reply?:string; 
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
  tools: any[];
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
  executingFlow: IAgentFlowState,
  sessionId: string,
  initialQuery: string,
  botId: string,
  userId: string,
  socket: Socket,
  confirmationAwaiting: Map<string, (response: string) => void>,
  accountId:string,
  flowId:string
): Promise<string | number | undefined> {
  console.log("Available functions:", node.availableFunctions?.[0]);
 
  try {
 
    if (node.agentName === "reactAgent") {
      console.log('[Decision] Redirecting to ReAct Agent from Node-RED.');
      const result =await executeReactAgentNode(
        node,
        executingFlow.id,
        initialQuery,
        botId,
        userId,
        socket,
        confirmationAwaiting,
        sessionId,
        accountId
      );
      console.log('result in nodeAgentService',result)
      return result
    }
    if(node.agentName === "replyAgent"){
      console.log('replyAgent called, executing executeReplyAgentNode...');
      const replyResult = await executeReplyAgentNode(node);
      // Agar reply milta hai, to use return karein, jisse flow end ho jaye
      if (replyResult) {
          return replyResult;
      }
      // Agar reply nahi mila to error return karein
      return "Error: Reply not found for replyAgent node.";
    }

    const toolId = node.availableFunctions?.[0]?.id;
    if (!toolId) {
      console.error("❌ Error: No tool ID found in the node.");
      return "Error";
    }
    const tool = await fetchAvailableTool(toolId);
    if (!tool) {
        console.error("❌ Error: Tool not found.");
        return "Error";
    }
   console.log('sending data to the toolExecutor')
    const result = await ToolExecutor.executeTools(tool, executingFlow.id, query, node, sessionId,flowId);

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