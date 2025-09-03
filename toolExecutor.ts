import { IExecutingBotFlow, IMesssage, INode } from "./executingFlow.interface";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { LLMService } from "./llmService";
import { Tool } from "./tool.interface";
import { Tools } from "./tools";
import { FlowNode } from "./types";


type Message = { role: "user" | "assistant"; content: string };

export class ToolExecutor {
  private availableTool: Tool | null;
  private executingFlowObject: IExecutingBotFlow | null;
  private node: FlowNode | null;
  private history: Message[];

  private constructor(tool: Tool, node: FlowNode) {


    this.availableTool = tool;
    this.node = node;
    this.executingFlowObject = null;
    this.history = [];
  }

  private async getNextNodeIdFromLLM(
    result: any,
    conditions: any[]
  ): Promise<string> {
    const llmService = new LLMService();
    const prompt = `The result of node execution is ${result}.
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
      const latestVariable =
        this.executingFlowObject.variables[this.executingFlowObject.variables.length - 1];
      const { tool: toolName, functionParameters } = latestVariable;

      const num1 = Number(functionParameters?.[0]?.variableValue ?? 0);
      const num2 = Number(functionParameters?.[1]?.variableValue ?? 0);

      const operations: Record<string, (a: number, b: number) => number> = {
        Sum: Tools.sum,
        Multiple: Tools.multiply,
        Division: Tools.division,
         Subtract: Tools.subtract,
        Mod: Tools.mod
      };

      if (typeof toolName !== "string" || !(toolName in operations)) {
        console.error(`Unknown or invalid tool: ${toolName}`);
        return null;
      }

      const operation = operations[toolName];
      const result = operation(num1, num2);
      console.log(`Tool execution result: ${result}`);

      // Update the state of the current node to "Completed"
      await ExecutingBotFlow.findOneAndUpdate(
        { _id: this.executingFlowObject.id },
        {
          $set: { "nodes.$[elem].nodeState": "Completed" },
        },
        {
          new: true,
          arrayFilters: [{ "elem.userAgentName": this.node?.userAgentName }],
        }
      );


      if (this.node?.condition?.length) {
        const nextNodeId = await this.getNextNodeIdFromLLM(
          result,
          this.node.condition
        );

        await this.saveMessage(
          `LLM's decision: Proceed to node with ID ${nextNodeId} based on result ${result}.`
        );

        return { nextNodeId };
      }

      console.log("No conditions found. Saving the result to messages.");
      await this.saveMessage(`The final result of the operation is: ${result}`);
      return { result };
    }
    return null;
  }
  
  private async saveMessage(content: string) {
    const message: IMesssage = { message: content, owner: "System" };
    await ExecutingBotFlow.findOneAndUpdate(
      { _id: this.executingFlowObject?.id },
      { $push: { messages: message } },
      { new: true }
    );
  }

  public async functionalAgent(query: string, executingFlowId: string): Promise<string | number | undefined> {
    if (!this.availableTool) {
      console.error("Error: Tool is not available.");
      return;
    }

    try {
      const llmService = new LLMService();
      const botFlow = await ExecutingBotFlow.findById(executingFlowId);

      if (!botFlow) {
        console.error("ExecutingBotFlow document not found.");
        return;
      }

      const latestVariableEntry = botFlow.variables.length > 0 ? botFlow.variables[botFlow.variables.length - 1] : null;

      if (!latestVariableEntry) {
        console.error("Latest variable entry not found.");
        return;
      }

      const prompt = `You are a helpful assistant that fills in a function's parameters based on a user's query. Your task is to extract parameter values and return the updated parameter list in a JSON array.
      Function Name: ${this.availableTool.toolName}
      Required Parameters: ${JSON.stringify(this.availableTool.parameters)}
      Current Parameters: ${JSON.stringify(latestVariableEntry.functionParameters || [])}
      
      Instructions:
      1. Identify and extract values for any parameter from the user's query.
      2. Update the 'variableValue' of the corresponding parameter objects in the 'Current Parameters' list.
      3. If a parameter's value is not found in the query, its 'variableValue' must remain 'null'. Do not invent values.
      4. If a parameter already has a value, do not change it unless the user explicitly provides a new one.
      5. Return ONLY the final, complete 'Current Parameters' array as a raw JSON object.
      6. Do NOT include any extra text, code blocks, or explanations outside the JSON array.`;

      this.history.push({ role: "user", content: query });
      const parametersJsonString = await llmService.callGrok(prompt, this.history, query);
      const updatedFunctionParameters = JSON.parse(parametersJsonString);
      
      const missingParams = updatedFunctionParameters.filter((param: any) => param.variableValue === null);
      const stateUpdate = missingParams.length === 0 ? true : false;
      
      // update the specific variable entry in the database
      const updatedBotFlow = await ExecutingBotFlow.findOneAndUpdate(
        {
          _id: executingFlowId,
          "variables.userAgentName": latestVariableEntry.userAgentName,
        },
        {
          $set: {
            "variables.$[elem].functionParameters": updatedFunctionParameters,
            "variables.$[elem].state": stateUpdate,
          },
        },
        {
          new: true,
          arrayFilters: [{ "elem.userAgentName": this.node?.userAgentName }],
        }
      );

      if (!updatedBotFlow) {
        console.error("Failed to update ExecutingBotFlow document.");
        return;
      }

      this.executingFlowObject = updatedBotFlow as unknown as IExecutingBotFlow;

      if (stateUpdate) {
        const executionResult = await this.executeToolLogic();
        if (executionResult?.nextNodeId) {
          return executionResult.nextNodeId;
        } else if (executionResult?.result !== undefined) {
          return Number(executionResult.result);
        }
      } else {
        const missingNames = missingParams.map((param: any) => param.variableName).join(", ");
        const userPrompt = `For the '${this.availableTool?.toolName}' tool, please provide the value for the following parameters: ${missingNames}.`;
        
        const messageObject: IMesssage = {
          message: userPrompt,
          owner: "System",
        };
        await ExecutingBotFlow.findOneAndUpdate(
          { _id: this.executingFlowObject?.id },
          { $push: { messages: messageObject } },
          { new: true }
        );
        
        return "PROMPT_REQUIRED";
      }
    } catch (error) {
      console.error("Error in functionalAgent:", error);
      return "Error"; // Return a consistent error message
    }
  }

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

    const existingFlow = await ExecutingBotFlow.findById(executingFlowId);

    const update: any = { $set: { flowState: "running" }, $push: {} };

    const nodeExists = existingFlow?.nodes?.some((node) => node.userAgentName === this.node?.userAgentName);
    if (!nodeExists) {
      const currentNode: INode = {
        userAgentName: this.node.userAgentName,
        condition: this.node?.condition,
        availableFunctions: [
          {
            funId: this.node.availableFunctions[0].funId,
            funName: this.node.availableFunctions[0].funName,
          },
        ],
        nodeState: "Running",
      };
      update.$push.nodes = currentNode;
    }

    const variableExists = existingFlow?.variables?.some((v) => v.userAgentName === this.node?.userAgentName && v.state === false);
    if (!variableExists) {
      const functionParameters = tool.parameters?.map((p: any) => ({
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

      update.$push.variables = newVariableEntry;
    }

    if (Object.keys(update.$push).length === 0) {
      delete update.$push;
    }

    const updatedExecutingFlow = await ExecutingBotFlow.findOneAndUpdate(
      { _id: executingFlowId },
      update,
      { new: true }
    );

    if (updatedExecutingFlow) {
      this.executingFlowObject = updatedExecutingFlow as unknown as IExecutingBotFlow;

    } else {
      console.error("Failed to update executing flow: Document not found.");
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
