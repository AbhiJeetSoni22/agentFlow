// toolExecutor.ts

import { IExecutingBotFlow } from "./executingFlow.interface";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { Tool } from "./tool.interface";
import { FlowNode } from "./types";

export class ToolExecutor {
    private availableTool: Tool | null;
    private executingFlowObject: IExecutingBotFlow | null;
    private node: FlowNode | null;

  
    private constructor(tool: Tool, node: FlowNode) {
        console.log('ToolExecutor instance created and properties initialized.');
    
        this.availableTool = tool;
        this.node = node;
        this.executingFlowObject = null; 
    }

    // Yeh hai naya static factory method
   
    public async updateExecutingFlowDocument(executingFlowId: string, tool: Tool) {
        if (!this.node) {
            console.error("Error: node is not set before calling updateExecutingFlowDocument.");
            return;
        }

        const updatedExecutingFlow = await ExecutingBotFlow.findOneAndUpdate(
            {
                _id: executingFlowId,
                "flow.userAgentName": this.node.userAgentName
            },
            {
                $set: {
                    "flow.$.availableFunctions.0.funName": tool.toolName,
                    "flow.$.availableFunctions.0.parameters": tool.parameters || [],
                    "flow.$.availableFunctions.0.toolConfig": tool.toolConfig || null,
                    "flowState": "Running"
                }
            },
            { new: true }
        );
        console.log('executingflow updated with data ');
    }
     public static async executeTools(
        tool: any,
        executingFlowId: string,
        query: string,
        node: FlowNode
    ): Promise<string | number> {

        const executor = new ToolExecutor(tool, node);

   
        return await executor.runExecution(executingFlowId, query);
    }

    // Actual execution logic ab ek private method mein hai
    private async runExecution(executingFlowId: string, query: string): Promise<string | number> {
     

        // Null check ke baad update method ko call kiya
        if (this.availableTool) {
            await this.updateExecutingFlowDocument(executingFlowId, this.availableTool);
        }

        return 'nextnode or result';
    }

}