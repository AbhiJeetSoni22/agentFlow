// toolExecutor.ts

import { IExecutingBotFlow, INode } from "./executingFlow.interface";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { LLMService } from "./llmService";
import { Tool } from "./tool.interface";
import { FlowNode } from "./types";

// Define Message type if not already imported
type Message = { role: "user" | "assistant"; content: string };

export class ToolExecutor {
  private availableTool: Tool | null;
  private executingFlowObject: IExecutingBotFlow | null;
  private node: FlowNode | null;
  private history: Message[];

  private constructor(tool: Tool, node: FlowNode) {
    console.log("ToolExecutor instance created and properties initialized.");

    this.availableTool = tool;
    this.node = node;
    this.executingFlowObject = null;
    this.history = [];
  }

  public async functionalAgent(query: string, executingFlowId: string) {
    if (!this.availableTool) {
      console.error("Error: Tool is not available.");
      return;
    }

    try {
      const llmService = new LLMService();

      const prompt = `You are a helpful assistant that extracts function parameters from user queries.The user wants to call the following function: ${
        this.availableTool.toolName
      }
     The required parameters for this function are: ${JSON.stringify(
        this.availableTool.parameters
      )}
       Please extract the values for these parameters from the user's query and return a JSON object. Do not include any other text. Only return the JSON object.
      Example: If the query is "I want to book a flight from Delhi to Mumbai" and the parameters are 
      [{ "key": "source", "type": "string" }, { "key": "destination", "type": "string" }], the output should be:
      { "source": "Delhi", "destination": "Mumbai" }`;

      this.history.push({ role: "user", content: query });

      const parametersJsonString = await llmService.callGrok(
        prompt,
        this.history,
        query
      );

       const extractedParameters = JSON.parse(parametersJsonString);
    console.log("✅ Extracted Parameters from LLM:", extractedParameters);

    // ✅ MongoDB se document fetch kiya ja raha hai latest entry ko update karne ke liye
    const botFlow = await ExecutingBotFlow.findById(executingFlowId);

    if (!botFlow || botFlow.variables.length === 0) {
      console.log("❌ ExecutingBotFlow document ya variables nahi mile.");
      return;
    }

    const latestVariableEntry = botFlow.variables[botFlow.variables.length - 1];
    
    // `extractedParameters` se values lekar `latestVariableEntry` ko update karna
    for (const [key, value] of Object.entries(extractedParameters)) {
      const paramToUpdate = latestVariableEntry.functionParameters.find(
        (p: any) => p.variableName === key
      );

      if (paramToUpdate) {
        paramToUpdate.variableValue = value as string;
        paramToUpdate.received = true;
        console.log(`✅ Parameter '${key}' updated with value: '${value}'`);
      }
    }

    // ---
    // ✅ Updated MongoDB query and update operation
    const updatedBotFlow = await ExecutingBotFlow.findOneAndUpdate(
      {
        _id: executingFlowId,
        "variables.userAgentName": latestVariableEntry.userAgentName,
        "variables.tool": this.availableTool.toolName, // ✅ Ye condition add ki gayi hai
      },
      {
        $set: { "variables.$": latestVariableEntry },
      },
      { new: true }
    );
    // ---

    if (updatedBotFlow) {
      this.executingFlowObject = updatedBotFlow as unknown as IExecutingBotFlow;
      console.log("✅ ExecutingBotFlow document updated successfully.");
    } else {
      console.error("❌ Failed to update ExecutingBotFlow document.");
    }

    this.history.push({ role: "assistant", content: parametersJsonString });
  } catch (error) {
    console.error("❌ Error in functionalAgent:", error);
  }
}

  // function where executingBotFlowState updated
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
    //current node for executingbotflow
    const currentNode: INode = {
      userAgentName: this.node.userAgentName,
      condition: this.node?.condition,
      availableFunctions: [
        {
          funId: this.node.availableFunctions[0],
          funName: this.node.availableFunctions[1],
        },
      ],
      nodeState: "Running",
    };
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
        $push: { nodes: currentNode, variables: newVariableEntry }, // 👈 naya entry insert
        $set: { flowState: "running" }, // flow ka state update
      },
      { new: true }
    );

    if (updatedExecutingFlow) {
      this.executingFlowObject =
        updatedExecutingFlow as unknown as IExecutingBotFlow;
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

    await executor.functionalAgent(query, executingFlowId);
    return "nextnode or result";
  }
}
