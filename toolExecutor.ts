// toolExecutor.ts

import {
  IAvailableFunction,
  IExecutingBotFlow,
} from "./executingFlow.interface";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { Tool } from "./tool.interface";
import { FlowNode } from "./types";

export class ToolExecutor {
  private availableTool: Tool | null;
  private executingFlowObject: IExecutingBotFlow | null;
  private node: FlowNode | null;
  private currentFunction: IAvailableFunction | null;
  private constructor(tool: Tool, node: FlowNode) {
    console.log("ToolExecutor instance created and properties initialized.");
    this.currentFunction = null;
    this.availableTool = tool;
    this.node = node;
    this.executingFlowObject = null;
  }

  //getCurrentFunction for getting the current function

  public async getCurrentFunction(
    tool: Tool,
    executingFlowObject: IExecutingBotFlow
  ): Promise<IAvailableFunction | null> {
    try {

      const flowNode = executingFlowObject.flow?.find(
        (node) => node.userAgentName === this.node?.userAgentName
      );

      if (!flowNode) {
        console.log("Error: Matching flow node not found.");
        return null;
      }

      const currentFunction = flowNode.availableFunctions?.find(
        (func) => func.funId === tool._id.toString()
      );
   
      if (currentFunction) {
        this.currentFunction = currentFunction;
        console.log("Current function found:", this.currentFunction);
        return this.currentFunction;
      } else {
        console.log("No matching function found in the flow node.");
        return null;
      }
    } catch (error) {
      console.error("Error in getCurrentFunction:", error);
      return null;
    }
  }
  // Yeh hai naya static factory method

  public async updateExecutingFlowDocument(
    executingFlowId: string,
    tool: Tool
  ) {
    if (!this.node) {
      console.error(
        "Error: node is not set before calling updateExecutingFlowDocument."
      );
      return;
    }

    const updatedExecutingFlow = await ExecutingBotFlow.findOneAndUpdate(
      {
        _id: executingFlowId,
        "flow.userAgentName": this.node.userAgentName,
      },
      {
        $set: {
          "flow.$.availableFunctions.0.funName": tool.toolName,
          "flow.$.availableFunctions.0.parameters": tool.parameters || [],
          "flow.$.availableFunctions.0.toolConfig": tool.toolConfig || null,
          flowState: "Running",
        },
      },
      { new: true }
    );
    if (updatedExecutingFlow) {
      this.executingFlowObject =
        updatedExecutingFlow as unknown as IExecutingBotFlow;

      //now send the tool and executingFlowObject to the function getCurrentFunction so we can grab function name, parameters, and config
      await this.getCurrentFunction(tool, this.executingFlowObject);

      console.log("executingflow updated with data ");
    } else {
      console.error("Failed to update executing flow: Document not found.");
    }
  }

  private async updateFlowState(
    executingFlowId: string,
    query: string
  ): Promise<void> {
    // Null check ke baad update method ko call kiya
    if (this.availableTool) {
      await this.updateExecutingFlowDocument(
        executingFlowId,
        this.availableTool
      );
    }
  }

  public static async executeTools(
    tool: any,
    executingFlowId: string,
    query: string,
    node: FlowNode
  ): Promise<string | number> {
    const executor = new ToolExecutor(tool, node);

    await executor.updateFlowState(executingFlowId, query);

    return "nextnode or result";
  }

  // Actual execution logic ab ek private method mein hai
}
