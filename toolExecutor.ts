// toolExecutor.ts

import { IExecutingBotFlow, INode } from "./executingFlow.interface";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { Tool } from "./tool.interface";
import { FlowNode } from "./types";

export class ToolExecutor {
  private availableTool: Tool | null;
  private executingFlowObject: IExecutingBotFlow | null;
  private node: FlowNode | null;

  private constructor(tool: Tool, node: FlowNode) {
    console.log("ToolExecutor instance created and properties initialized.");

    this.availableTool = tool;
    this.node = node;
    this.executingFlowObject = null;
  }

  // Yeh hai naya static factory method

  public async updateExecutingFlowDocument(executingFlowId: string,tool: Tool) {
    if (!this.node) {
      console.error(
        "Error: node is not set before calling updateExecutingFlowDocument."
      );
      return;
    }
    //current node for executingbotflow
    const currentNode:INode = {
        userAgentName:this.node.userAgentName,
        condition : this.node?.condition,
        availableFunctions :[
          { funId: this.node.availableFunctions[0],
            funName: this.node.availableFunctions[1],
          }
        ],
        nodeState:'Running'
    }
    // functionParameters map karna
    const functionParameters =
      tool.parameters?.map((p: any) => ({
        variableName: p.key,
        validation: p.validation,
        variableValue: p.value ?? null,
        received: p.received ?? false,
      })) || [];

    const newVariableEntry = {
      state: false,
      userAgentName: this.node.userAgentName,
      tool: tool.toolName,
      functionParameters,
    };

    const updatedExecutingFlow = await ExecutingBotFlow.findOneAndUpdate(
      { _id: executingFlowId },
      {
        $push: { nodes: currentNode,
          variables: newVariableEntry }, // 👈 naya entry insert
        $set: { flowState: "running" }, // flow ka state update
      },
      { new: true }
    );

    if (updatedExecutingFlow) {
      this.executingFlowObject =updatedExecutingFlow as unknown as IExecutingBotFlow;
      console.log("✅ New variable inserted into executing flow");
    } else {
      console.error("❌ Failed to update executing flow: Document not found.");
    }
  }

  // Actual execution logic ab ek private method mein hai
  private async updateBotFlowState(executingFlowId: string): Promise<void> {
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

    await executor.updateBotFlowState(executingFlowId);
    return "nextnode or result";
  }
}
