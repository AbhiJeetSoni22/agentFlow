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
  } // LLM se next node ID lene ke liye private method
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
      } else if (currentVariableToolName === "Subtract") {
        result = Tools.subtract(num1, num2);
      } else if (currentVariableToolName === "Mod") {
        result = Tools.mod(num1, num2);
      } else {
        console.error(`Unknown tool: ${currentVariableToolName}`);
        return;
      }

      console.log(`Tool execution result: ${result}`); // Update the state of the current node to "Completed"

      await ExecutingBotFlow.findOneAndUpdate(
        { _id: this.executingFlowObject?.id },
        {
          $set: {
            "nodes.$[elem].nodeState": "Completed",
          },
        },
        {
          new: true,
          arrayFilters: [{ "elem.userAgentName": this.node?.userAgentName }],
        }
      );
      console.log(
        `Node '${this.node?.userAgentName}' state updated to 'Completed'.`
      );

      if (this.node?.condition && this.node.condition.length > 0) {
        console.log("Conditions found. Sending result and conditions to LLM.");
        const nextNodeId = await this.getNextNodeIdFromLLM(
          result,
          this.node.condition
        );
        console.log(
          `LLM decided to proceed to the next node with ID: ${nextNodeId}`
        );

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
  } //functionalAgent function

  public async functionalAgent(query: string, executingFlowId: string) {
    if (!this.availableTool) {
      console.error("Error: Tool is not available.");
      return;
    }

    try {
      const llmService = new LLMService();

      const botFlow = await ExecutingBotFlow.findById(executingFlowId);
      if (!botFlow) {
        console.log(" ExecutingBotFlow document not found.");
        return;
      } // Latest variable entry ko find karna
      let latestVariableEntry =
        botFlow.variables.length > 0
          ? botFlow.variables[botFlow.variables.length - 1]
          : null; // Agar latest variable entry nahi hai ya uski state true hai, to naya entry banayein

      if (!latestVariableEntry || latestVariableEntry.state === true) {
        console.log(
          "Creating new variable entry because  previous was completed."
        );
        const functionParameters =
          this.availableTool.parameters?.map((p: any) => ({
            variableName: p.key,
            validation: p.validation,
            variableValue: p.value ?? null,
            received: p.received ?? false,
          })) || [];

        const newVariableEntry = {
          state: false,
          userAgentName: this.node?.userAgentName,
          tool: this.availableTool.toolName,
          functionParameters,
        };

        await ExecutingBotFlow.findOneAndUpdate(
          { _id: executingFlowId },
          { $push: { variables: newVariableEntry } },
          { new: true }
        );
        this.executingFlowObject = (await ExecutingBotFlow.findById(
          executingFlowId
        )) as unknown as IExecutingBotFlow;
        latestVariableEntry = this.executingFlowObject?.variables
          ? (this.executingFlowObject.variables[
              this.executingFlowObject.variables.length - 1
            ] as any)
          : null;
      } // LLM ko updated query ke saath call karna
      this.history.push({ role: "user", content: query });
      const prompt = `You are a helpful assistant that fills in a function's parameters based on a user's query. Your task is to extract parameter values and return the updated parameter list in a JSON array.
       Function Name: ${this.availableTool.toolName}
       Required Parameters: ${JSON.stringify(this.availableTool.parameters)}
       Current Parameters: ${JSON.stringify(
        latestVariableEntry?.functionParameters || []
      )}
      
      Instructions:
      1. Identify and extract values for any parameter from the user's query.
      2. Update the 'variableValue' of the corresponding parameter objects in the 'Current Parameters' list.
      3. If a parameter's value is not found in the query, its 'variableValue' must remain 'null'. Do not invent values.
      4. If a parameter already has a value, do not change it unless the user explicitly provides a new one.
      5. Return ONLY the final, complete 'Current Parameters' array as a raw JSON object.
      6. Do NOT include any extra text, code blocks, or explanations outside the JSON array.`;

      const parametersJsonString = await llmService.callGrok(
        prompt,
        this.history,
        query
      );

      const updatedFunctionParameters = JSON.parse(parametersJsonString); // Update the specific variable entry in the database
      const updatedBotFlow = await ExecutingBotFlow.findOneAndUpdate(
        {
          _id: executingFlowId,
          "variables.userAgentName": latestVariableEntry?.userAgentName,
        },
        {
          $set: {
            "variables.$[elem].functionParameters": updatedFunctionParameters,
          },
        },
        {
          new: true,
          arrayFilters: [{ "elem.userAgentName": this.node?.userAgentName }],
        }
      );

      if (updatedBotFlow) {
        this.executingFlowObject =
          updatedBotFlow as unknown as IExecutingBotFlow;
        const currentVariableIndex = updatedBotFlow.variables.length - 1;
        const isReadyToExecute =
          updatedBotFlow.variables[currentVariableIndex].state;
        const missingParams = updatedFunctionParameters.filter(
          (param: any) => param.variableValue === null
        );

        if (missingParams.length === 0) {
          // Ab state ko update karein jab saare parameters mil jaayen
          await ExecutingBotFlow.findOneAndUpdate(
            {
              _id: executingFlowId,
              "variables.userAgentName": this.node?.userAgentName,
            },
            { $set: { "variables.$[elem].state": true } },
            {
              new: true,
              arrayFilters: [
                { "elem.userAgentName": this.node?.userAgentName },
              ],
            }
          );
          console.log(
            "All parameters received. Variable state updated to true."
          ); // Execute the tool logic and return the result

          const executionResult = await this.executeToolLogic();
          if (executionResult?.nextNodeId) {
            return executionResult.nextNodeId;
          } else if (executionResult?.result !== undefined) {
            return Number(executionResult.result);
          }
        } else {
          const missingNames = missingParams
            .map((param: any) => param.variableName)
            .join(", ");
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
          this.history.push({ role: "assistant", content: userPrompt });
          return "PROMPT_REQUIRED";
        }
      } else {
        console.error(" Failed to update ExecutingBotFlow document.");
      }
      this.history.push({
        role: "assistant",
        content: JSON.stringify(updatedFunctionParameters),
      });
    } catch (error) {
      console.error(" Error in functionalAgent:", error);
    }
  } // function where executingBotFlowState updated

  public async updateExecutingFlowDocument(
    executingFlowId: string,
    tool: Tool
  ) {
    if (!this.node) {
      console.error(
        "Error: node is not set before calling updateExecutingFlowDocument."
      );
      return;
    } // Check if the node entry already exists

    const existingFlow = await ExecutingBotFlow.findById(executingFlowId);
    const nodeExists = existingFlow?.nodes?.some(
      (node) => node.userAgentName === this.node?.userAgentName
    );

    const update: any = { $set: { flowState: "running" } };

    if (!nodeExists) {
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
      update.$push = { nodes: currentNode };
    } // Check if the variable entry already exists

    const variableExists = existingFlow?.variables?.some(
      (v) => v.userAgentName === this.node?.userAgentName
    );

    if (!variableExists) {
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

      if (update.$push) {
        update.$push.variables = newVariableEntry;
      } else {
        update.$push = { variables: newVariableEntry };
      }
    }

    const updatedExecutingFlow = await ExecutingBotFlow.findOneAndUpdate(
      { _id: executingFlowId },
      update,
      { new: true }
    );

    if (updatedExecutingFlow) {
      this.executingFlowObject =
        updatedExecutingFlow as unknown as IExecutingBotFlow;
      console.log(" Executing flow document updated successfully.");
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
