// functionalAgent.ts


import { IExecutingBotFlow } from "./executingFlow.interface";

import { ToolExecutor } from "./toolExecutor";
import { fetchAvailableTool } from "./tools";
import {  FlowNode } from "./types";

// Agent Class
class Agent {
  private node: FlowNode;
  private query: string;
  private executingFlow: IExecutingBotFlow;
  // private availableTool: AvailableTools;

  // Constructor now expects parameters to be provided
  constructor(node: FlowNode, query: string, executingFlow:IExecutingBotFlow) {
    this.node = node;
    this.query = query;
    this.executingFlow= executingFlow
  }

  async run(): Promise<string | number> {

    
    try {
      // tool id is always at the first index of the availableFunction array
      const toolId= this.node.availableFunctions[0];
// fetching tool as per toolId using function.
      const tool = await fetchAvailableTool(toolId)
  
      const executingFlowId = this.executingFlow.id;
   
    const result = await ToolExecutor.executeTools(tool, executingFlowId, this.query, this.node);
     
      try {
        const parsed = 'parse'
        console.log("✅ Parsed response:", parsed);
        return parsed;
      } catch (parseError) {
        console.log("❌ JSON parse error:", parseError);
        return 'Tool not Found';
      }
    } catch (error: any) {
      console.log("❌ Error in Agent.run():", error.message);
      throw error;
    }

  }
}

export async function nodeAgent(
  node: FlowNode,
  query: string,
  executingFlow : IExecutingBotFlow
): Promise<string | number> {
  console.log("🚀 nodeAgent function called");
  console.log("Available functions:", node.availableFunctions);

  try {
  
    const agent = new Agent(node, query,executingFlow);
    const result = await agent.run();
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