// Imports
import { ExecutingBotFlow } from "../../models/executingFlow";
import { LLMService } from "./llmService";
import { executeToolById } from "./toolExecution";
import { IExecutingBotFlow, IMesssage } from "../../interfaces/executingFlow.interface";
import { Tool } from "../../interfaces/tool.interface";
import { FlowNode } from "./nodeAgentService";
import { INode } from "../../interfaces/executingFlow.interface";

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

    // A static factory method for creating and running the executor
    public static async executeTools(
        tool: any,
        executingFlowId: string,
        query: string,
        node: FlowNode
    ): Promise<string | number | undefined> {
        const executor = new ToolExecutor(tool, node);
        await executor.updateFlowDocumentAndState(executingFlowId);
        const result = await executor.functionalAgent(query, executingFlowId);
        return result === null ? undefined : result;
    }

    // This method combines updateBotFlowState and updateExecutingFlowDocument
    private async updateFlowDocumentAndState(executingFlowId: string): Promise<void> {
        if (!this.node || !this.availableTool) {
            console.error("Error: Node or tool is not set.");
            return;
        }

        const existingFlow = await ExecutingBotFlow.findById(executingFlowId);
        if (!existingFlow) {
            console.error("Error: Executing flow not found.");
            return;
        }

        const nodeExists = existingFlow.nodes?.some(n => n.userAgentName === this.node?.userAgentName);
        const variableExists = existingFlow.variables?.some(v => v.userAgentName === this.node?.userAgentName);

        if (nodeExists && variableExists) {
            this.executingFlowObject = existingFlow as unknown as IExecutingBotFlow;
            return;
        }

        const update: any = { $set: { flowState: "running" }, $push: {} };

        if (!nodeExists) {
            const currentNode: INode = {
                userAgentName: this.node.userAgentName,
                condition: this.node.condition,
                availableFunctions: this.node.availableFunctions,
                nodeState: "Running",
            };
            update.$push.nodes = currentNode;
        }

        if (!variableExists) {
            const functionParameters = this.availableTool.toolConfig.dynamicParams?.map((p: any) => ({
                variableName: p.key,
                validation: p.validation,
                variableValue: p.value ?? null,
                received: p.received ?? false,
            })) || [];
            console.log('function parameter in toolExecutor file ...........',functionParameters)
            const newVariableEntry = {
                state: false,
                userAgentName: this.node.userAgentName,
                tool: this.availableTool.toolName,
                functionParameters,
            };
            update.$push.variables = newVariableEntry;
        }

        const updatedFlow = await ExecutingBotFlow.findOneAndUpdate(
            { _id: executingFlowId },
            Object.keys(update.$push).length > 0 ? update : { $set: update.$set },
            { new: true, upsert: false }
        );

        if (updatedFlow) {
            this.executingFlowObject = updatedFlow as unknown as IExecutingBotFlow;
        } else {
            console.error("Failed to update executing flow: Document not found.");
        }
    }

    private async functionalAgent(
        query: string,
        executingFlowId: string
    ): Promise<string | number | undefined | null> {
        if (!this.availableTool || !this.node) {
            console.error("Error: Tool or Node is not available in functionalAgent.");
            return null;
        }

        try {
            const botFlow = await ExecutingBotFlow.findById(executingFlowId);
            const latestVariableEntry = botFlow?.variables?.find(v => v.userAgentName === this.node?.userAgentName);

            if (!latestVariableEntry) {
                console.error("Latest variable entry not found.");
                return null;
            }

            const parametersJsonString = await this.getLLMUpdatedParameters(query, latestVariableEntry);
            const updatedFunctionParameters = JSON.parse(parametersJsonString);
            
            const missingParams = updatedFunctionParameters.filter(
                (param: any) => param.variableValue === null || param.variableValue === ""
            );
            const allParametersFilled = missingParams.length === 0;
          
            if (!latestVariableEntry.userAgentName) {
                console.error("userAgentName is missing in latestVariableEntry.");
                return null;
            }
            await this.updateParametersInDb(
                executingFlowId,
                latestVariableEntry.userAgentName as string,
                updatedFunctionParameters,
                allParametersFilled
            );

            if (allParametersFilled) {
                return this.handleToolExecutionAndConditions(executingFlowId, updatedFunctionParameters);
            } else {
                return this.handlePromptRequired(missingParams);
            }
        } catch (error) {
            console.error("Error in functionalAgent:", error);
            return "Error";
        }
    }

    private async getLLMUpdatedParameters(query: string, latestVariableEntry: any): Promise<string> {
        const llmService = new LLMService();
        const prompt = this.createLLMPrompt(latestVariableEntry);
        this.history.push({ role: "user", content: query });
        return llmService.callGrok(prompt, this.history, query);
    }

    private createLLMPrompt(latestVariableEntry: any): string {
        return `You are a helpful assistant that fills in a function's parameters based on a user's query. Your task is to extract parameter values and return the updated parameter list in a JSON array.
Function Name: ${this.availableTool?.toolName}
Required Parameters: ${JSON.stringify(this.availableTool?.parameters)}
Current Parameters: ${JSON.stringify(latestVariableEntry.functionParameters || [])}
Instructions:
1. Identify and extract values for any parameter from the user's query.
2. Update the 'variableValue' of the corresponding parameter objects in the 'Current Parameters' list.
3. If a parameter's value is not found in the query, its 'variableValue' must remain 'null'. Do not invent values.
4. If a parameter already has a value, do not change it unless the user explicitly provides a new one.
5. Return ONLY the final, complete 'Current Parameters' array as a raw JSON object.
6. Do NOT include any extra text, code blocks, or explanations outside the JSON array.`;
    }

    private async updateParametersInDb(
        executingFlowId: string,
        userAgentName: string,
        updatedFunctionParameters: any[],
        allParametersFilled: boolean
    ): Promise<void> {
        await ExecutingBotFlow.findOneAndUpdate(
            {
                _id: executingFlowId,
                "variables.userAgentName": userAgentName,
            },
            {
                $set: {
                    "variables.$[elem].functionParameters": updatedFunctionParameters,
                    "variables.$[elem].state": allParametersFilled,
                },
            },
            {
                new: true,
                arrayFilters: [{ "elem.userAgentName": userAgentName }],
            }
        );
    }

    private async handleToolExecutionAndConditions(executingFlowId: string, updatedFunctionParameters: any[]) {
        const args = updatedFunctionParameters.reduce((obj: any, param: any) => {
            obj[param.variableName] = param.variableValue;
            return obj;
        }, {});

        const toolId = this.availableTool?._id?.toString();
        if (!toolId) {
            console.error("Tool ID not found.");
            return null;
        }

        const executionResult = await executeToolById(toolId, args, this.executingFlowObject!.userId);
        
        await ExecutingBotFlow.findOneAndUpdate(
            { _id: executingFlowId },
            { $set: { "nodes.$[elem].nodeState": "Completed" } },
            { new: true, arrayFilters: [{ "elem.userAgentName": this.node?.userAgentName }] }
        );

        if (this.node?.condition?.length) {
            const nextNodeId = await this.getNextNodeIdFromLLM(executionResult, this.node.condition);
            await this.saveMessage(`LLM's decision: Proceed to node with ID ${nextNodeId} based on result ${executionResult}.`);
            return nextNodeId;
        }

        await this.saveMessage(`The final result of the operation is: ${executionResult}`);
        return executionResult;
    }

    private async handlePromptRequired(missingParams: any[]) {
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

    private async getNextNodeIdFromLLM(result: any, conditions: any[]): Promise<string> {
        const llmService = new LLMService();
        const prompt = `The result of node execution is ${result}. Here are the available conditions: ${JSON.stringify(conditions)}. Based on the result, which condition is met? Return only the 'executeAgent' value of the satisfied condition. For example, if the result is 30, and a condition says "result should be smaller than 50", you should return the corresponding 'executeAgent' ID. Return only the ID, nothing else.`;
        const llmResponse = await llmService.callGrok(prompt, this.history, `Result: ${result}`);
        return llmResponse.trim();
    }

    private async saveMessage(content: string) {
        const message: IMesssage = { message: content, owner: "System" };
        await ExecutingBotFlow.findOneAndUpdate(
            { _id: this.executingFlowObject?.id },
            { $push: { messages: message } },
            { new: true }
        );
    }
}