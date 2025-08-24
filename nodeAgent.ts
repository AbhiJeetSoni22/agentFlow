// functionalAgent.ts

import { LLMService } from "./llmService";
import { AvailableTools, Condition, FlowNode } from "./types";

// Agent Class
class Agent {
  private node: FlowNode;
  private query: string;
  private availableTools: AvailableTools[];

  // Constructor now expects parameters to be provided
  constructor(node: FlowNode, query: string, availableTools: AvailableTools[]) {
    this.node = node;
    this.query = query;
    this.availableTools = availableTools;
  }

  async run(): Promise<string | number> {

    
    try {
      const functionName = this.node.availableFunctions[0];

      const llm = new LLMService("grok");

      const prompt = `
You are a tool selector agent.
You will be given:
1. Function name: ${functionName}
2. Available tools: ${JSON.stringify(this.availableTools)}

Your task:
- Compare the given function name with the available tools.
- Pick the most relevant tool.
- Return only a JSON object with "toolId" and "toolName" and do not add anything else from your side.
- If no tool matches, return {"toolName":"not found"}.
`;

      const response = await llm.call(prompt, [], this.query);

      try {
        const parsed = JSON.parse(response);
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
  availableTools: AvailableTools[]
): Promise<string | number> {
  console.log("🚀 nodeAgent function called");
  console.log("Node display name:", node.displayAgentName);
  console.log("Available functions:", node.availableFunctions);

  try {

    const agent = new Agent(node, query, availableTools);
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