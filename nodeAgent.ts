import { IExecutingBotFlow } from "./executingFlow.interface";
import { ToolExecutor } from "./toolExecutor";
import { fetchAvailableTool } from "./tools";
import { FlowNode } from "./types";

export async function nodeAgent(
  node: FlowNode,
  query: string,
  executingFlow: IExecutingBotFlow
): Promise<string | number | undefined> {


  try {
    
    const toolId = node.availableFunctions?.[0].funId;
    if (!toolId) {
      console.error("Error: No tool ID found in the node.");
      return "Error";
    }
    const tool = await fetchAvailableTool(toolId);

    const executingFlowId = executingFlow.id;
    const result = await ToolExecutor.executeTools(
      tool,
      executingFlowId,
      query,
      node
    );

    if (result === undefined) {
      throw new Error("ToolExecutor.executeTools returned undefined check the execution ");
    }

    return result;
  } catch (error) {
    console.error("Error in nodeAgent :", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return "Error";
  }
}
