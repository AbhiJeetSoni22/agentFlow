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


  //functionalAgent function 
public async functionalAgent(query: string, executingFlowId: string) {
  if (!this.availableTool) {
    console.error("Error: Tool is not available.");
    return;
  }

  try {
    const llmService = new LLMService();

    const botFlow = await ExecutingBotFlow.findById(executingFlowId);
    if (!botFlow || botFlow.variables.length === 0) {
      console.log(" ExecutingBotFlow document ya variables nahi mile.");
      return;
    }
    const latestVariableEntry = botFlow.variables[botFlow.variables.length - 1];

    const prompt = `You are a helpful assistant that fills in a function's parameters based on a user's query. Your task is to extract parameter values and return the updated parameter list in a JSON array.

      Function Name: ${this.availableTool.toolName}
      Required Parameters: ${JSON.stringify(this.availableTool.parameters)}
      Current Parameters: ${JSON.stringify(latestVariableEntry.functionParameters)}

      Instructions:
      1. Identify and extract values for any parameter from the user's query.
      2. Update the 'variableValue' of the corresponding parameter objects in the 'Current Parameters' list.
      3. If a parameter's value is not found in the query, its 'variableValue' must remain 'null'. Do not invent values.
      4. If a parameter already has a value, do not change it unless the user explicitly provides a new one.
      5. Return ONLY the final, complete 'Current Parameters' array as a raw JSON object.
      6. Do NOT include any extra text, code blocks, or explanations outside the JSON array.`;

    this.history.push({ role: "user", content: query });

    const parametersJsonString = await llmService.callGrok(
      prompt,
      this.history,
      query
    );

    console.log(" AI response (raw JSON):", parametersJsonString);

    const updatedFunctionParameters = JSON.parse(parametersJsonString);
    latestVariableEntry.functionParameters = updatedFunctionParameters;

    latestVariableEntry.functionParameters.forEach((param: any) => {
      if (param.variableValue !== null && param.received === false) {
        param.received = true;
        console.log(`Parameter '${param.variableName}' updated with value: '${param.variableValue}'`);
      }
    });

    const missingParams = latestVariableEntry.functionParameters.filter(
      (param: any) => param.variableValue === null
    );

    //  Yahan par naya check lagaya gaya hai
    if (missingParams.length === 0) {
        latestVariableEntry.state = true; // state ko true kiya gaya hai
        console.log("All parameters received. Variable state updated to true.");
    }
    
    // Ab aage ka MongoDB update logic
    const updatedBotFlow = await ExecutingBotFlow.findOneAndUpdate(
      {
        _id: executingFlowId,
        "variables.userAgentName": latestVariableEntry.userAgentName,
        "variables.tool": this.availableTool.toolName,
      },
      {
        $set: { "variables.$": latestVariableEntry },
      },
      { new: true }
    );

    if (updatedBotFlow) {
      this.executingFlowObject = updatedBotFlow as unknown as IExecutingBotFlow;
      console.log(" ExecutingBotFlow document updated successfully.");
    } else {
      console.error(" Failed to update ExecutingBotFlow document.");
    }

    // Return logic
    if (missingParams.length > 0) {
      const missingNames = missingParams.map(param => param.variableName).join(', ');
      const userPrompt = `Please provide the value for the following parameters: ${missingNames}.`;
      console.log(` User will be prompted: "${userPrompt}"`);
      this.history.push({ role: "assistant", content: userPrompt });
      return userPrompt;
    }

    this.history.push({ role: "assistant", content: JSON.stringify(updatedFunctionParameters) });
    return "Next Node or Result";
    
  } catch (error) {
    console.error(" Error in functionalAgent:", error);
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
      console.log(" New variable inserted into executing flow");
    } else {
      console.error(" Failed to update executing flow: Document not found.");
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
