import { IExecutingBotFlow, IMesssage, INode } from "./executingFlow.interface";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { LLMService } from "./llmService";
import { Tool } from "./tool.interface";
import { Tools } from "./tools";
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

  // New private method to get the next node ID from the LLM
  private async getNextNodeIdFromLLM(
    result: number,
    conditions: any[]
  ): Promise<string> {
    const llmService = new LLMService();
    const prompt = `The result of the operation is ${result}.
    Here are the available conditions: ${JSON.stringify(conditions)}.
    Based on the result, which condition is met?
    Return only the 'executeAgent' value of the satisfied condition.
    For example, if the result is 30, and a condition says "result should be smaller than 50", you should return the corresponding 'executeAgent' ID.
    Return only the ID, nothing else.`;

    const llmResponse = await llmService.callGrok(
      prompt,
      this.history,
      `Result: ${result}`
    );
    return llmResponse.trim();
  }

public async executeToolLogic() {
  if (
    this.executingFlowObject?.variables &&
    this.executingFlowObject.variables.length > 0
  ) {
    let currentVariableIndex = this.executingFlowObject.variables.length - 1;
    let currentVariableObject =
      this.executingFlowObject.variables[currentVariableIndex];
    let currentVariableToolName = currentVariableObject.tool;
    console.log("now executing logic in executeToolLogic function");

    let num1 = Number(
      currentVariableObject?.functionParameters![0].variableValue
    );
    let num2 = Number(
      currentVariableObject?.functionParameters![1].variableValue
    );
    let result: number;

    if (currentVariableToolName === "Sum") {
      result = Tools.sum(num1, num2);
    } else if (currentVariableToolName === "Multiple") {
      result = Tools.multiply(num1, num2);
    } else if (currentVariableToolName === "Division") {
      result = Tools.division(num1, num2);
    } else {
      console.error(`Unknown tool: ${currentVariableToolName}`);
      return;
    }

    console.log(`Tool execution result: ${result}`);

    if (this.node?.condition && this.node.condition.length > 0) {
      console.log("Conditions found. Sending result and conditions to LLM.");
      const nextNodeId = await this.getNextNodeIdFromLLM(
        result,
        this.node.condition
      );
      console.log(
        `LLM decided to proceed to the next node with ID: ${nextNodeId}`
      );

      // LLM ke response ko message array mein save karna
      const messageObject: IMesssage = {
        message: `LLM's decision: Proceed to node with ID ${nextNodeId} based on result ${result}.`,
        owner: "System",
      };

      await ExecutingBotFlow.findOneAndUpdate(
        { _id: this.executingFlowObject?.id },
        {
          $push: { messages: messageObject },
        },
        { new: true }
      );

      return { nextNodeId };
    } else {
      // Jab koi condition nahi hai, tab result ko message array mein save karna
      console.log("No conditions found. Saving the result to messages.");

      const messageObject: IMesssage = {
        message: `The final result of the operation is: ${result}`,
        owner: "System",
      };

      await ExecutingBotFlow.findOneAndUpdate(
        { _id: this.executingFlowObject?.id },
        {
          $push: { messages: messageObject },
        },
        { new: true }
      );
      
      return { result };
    }
  }
  return null;
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
      const latestVariableEntry =
        botFlow.variables[botFlow.variables.length - 1];

      const prompt = `You are a helpful assistant that fills in a function's parameters based on a user's query. Your task is to extract parameter values and return the updated parameter list in a JSON array.

      Function Name: ${this.availableTool.toolName}
      Required Parameters: ${JSON.stringify(this.availableTool.parameters)}
      Current Parameters: ${JSON.stringify(
        latestVariableEntry.functionParameters
      )}

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
          console.log(
            `Parameter '${param.variableName}' updated with value: '${param.variableValue}'`
          );
        }
      });

      const missingParams = latestVariableEntry.functionParameters.filter(
        (param: any) => param.variableValue === null
      );

      if (missingParams.length === 0) {
        latestVariableEntry.state = true;
        console.log("All parameters received. Variable state updated to true.");
      }

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
        this.executingFlowObject =
          updatedBotFlow as unknown as IExecutingBotFlow;
        let currentVariableIndex = updatedBotFlow.variables.length - 1;
        const isReadyToExecute =
          updatedBotFlow.variables[currentVariableIndex].state;
        if (isReadyToExecute) {
          console.log(" Ready to execute function logic with toolName.");
          const executionResult = await this.executeToolLogic();
          if (executionResult?.nextNodeId) {
            console.log(
              `Flow will continue to the next node with ID: ${executionResult.nextNodeId}`
            );
            // Here you would add the logic to proceed to the next node
            return executionResult.nextNodeId;
          } else if (executionResult?.result !== undefined) {
            console.log(`Final result: ${executionResult.result}`);
            // Here you would add the logic to handle the final result
            return executionResult.result;
          }
        }
      } else {
        console.error(" Failed to update ExecutingBotFlow document.");
      }

      // Return logic
      if (missingParams.length > 0) {
        const missingNames = missingParams
          .map((param) => param.variableName)
          .join(", ");
        const userPrompt = `Please provide the value for the following parameters: ${missingNames}.`;
        console.log(` User will be prompted: "${userPrompt}"`);

        const messageObject: IMesssage = {
          message: userPrompt,
          owner: "System",
        };
        await ExecutingBotFlow.findOneAndUpdate(
          { _id: this.executingFlowObject?.id },
          {
            $push: { messages: messageObject },
          },
          { new: true }
        );
        this.history.push({ role: "assistant", content: userPrompt });
        return userPrompt;
      }

      this.history.push({
        role: "assistant",
        content: JSON.stringify(updatedFunctionParameters),
      });
      return "Next Node or Result";
    } catch (error) {
      console.error(" Error in functionalAgent:", error);
    }
  }

  // function where executingBotFlowState updated
  public async updateExecutingFlowDocument(executingFlowId: string,tool: Tool) {
    if (!this.node) {
      console.error(
        "Error: node is not set before calling updateExecutingFlowDocument."
      );
      return;
    }
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
        $push: { nodes: currentNode, variables: newVariableEntry },
        $set: { flowState: "running" },
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

  private async updateBotFlowState(executingFlowId: string): Promise<void> {
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
  ): Promise<string | number | undefined> {
    const executor = new ToolExecutor(tool, node);

    await executor.updateBotFlowState(executingFlowId);

    const result = await executor.functionalAgent(query, executingFlowId);
    return result;
  }
}
