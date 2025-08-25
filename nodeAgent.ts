// functionalAgent.ts

import { IExecutingBotFlow } from "./executingFlow.interface";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { LLMService } from "./llmService";
import { Tool } from "./tool.interface";
import { fetchAvailableTool } from "./tools";
import { AvailableTool, FlowNode } from "./types"; // Assuming Tool is also defined or returned by fetchAvailableTool
import { Document } from "mongoose";
// Define a Tool interface for clarity, assuming fetchAvailableTool returns this structur

// Agent Class
class Agent {
    private node: FlowNode;
    private query: string;
    private executingFlow: IExecutingBotFlow;

    constructor(node: FlowNode, query: string, executingFlow: IExecutingBotFlow) {
        this.node = node;
        this.query = query;
        this.executingFlow = executingFlow
    }

    async run(): Promise<string | number> {
        try {
            const toolId = this.node.availableFunctions[0];
            const toolNameFromNode = this.node.availableFunctions[1];

            // ⚠️ fetchAvailableTool returns a lean object, not a Mongoose document.
            // So, `toObject()` is not needed.
            const toolDocument = await fetchAvailableTool(toolId);

            if (!toolDocument) {
                console.log("⚠️ Tool not found with ID:", toolId);
                return "Tool not Found";
            }
            
            // 💡 FIX: Directly assign the `toolDocument` to the `tool` variable.
            // The type assertion `as Tool` is now correct because `fetchAvailableTool().lean()`
            // returns a plain object that matches the simplified `Tool` interface.
            const tool: Tool = toolDocument as unknown as Tool; 

            const executingFlowId = this.executingFlow._id;
            console.log('to update ', executingFlowId);

            const updatedExecutingFlow = await ExecutingBotFlow.findOneAndUpdate(
                {
                    _id: executingFlowId,
                    "flow.userAgentName": this.node.userAgentName
                },
                {
                    $set: {
                        "flow.$.availableFunctions.0.function.funName": tool.toolName || toolNameFromNode,
                        "flow.$.availableFunctions.0.function.parameters": tool.parameters || [],
                        "flow.$.availableFunctions.0.function.toolConfig": tool.toolConfig || null,
                        "flowState": "tool_fetched"
                    }
                },
                { new: true }
            );

            if (updatedExecutingFlow) {
                console.log("✅ ExecutingBotFlow document updated successfully with tool details!");
                try {
                    const parsed = 'parse_from_tool_execution_or_llm_service';
                    console.log("✅ Parsed response:", parsed);
                    return parsed;
                } catch (parseError) {
                    console.log("❌ JSON parse error:", parseError);
                    return 'Tool not Found';
                }
            } else {
                console.log("⚠️ No ExecutingBotFlow document found or updated.");
                return "Error updating flow";
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
    executingFlow: IExecutingBotFlow
): Promise<string | number> {
    console.log("🚀 nodeAgent function called");
    console.log("Available functions:", node.availableFunctions);

    try {
        const agent = new Agent(node, query, executingFlow);
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