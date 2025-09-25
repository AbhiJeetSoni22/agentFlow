 import { AgentFlowState } from "../../models/agentFlowState";
 import { LLMService } from "../llmService";
 import { executeToolById } from "./flowToolExecution";
 import {IAgentFlowState, IMesssage } from "../../interfaces/executingFlow.interface";
 import { Tool } from "../../interfaces/tool.interface";
 import { FlowNode } from "./nodeAgentService";
 import { INode } from "../../interfaces/executingFlow.interface";
 import { AgentFlow, Log } from "../../models";
 import { ReactAgentService } from "./reactAgentService";
 import { Socket } from "socket.io";
 
 type Message = { role: "user" | "assistant"; content: string };
 export async function executeReactAgentNode(
     node: FlowNode,
     executingFlowId: string,
     initialQuery: string,
     agentId: string,
     userId: string,
     socket: Socket,
     confirmationAwaiting: Map<string, (response: string) => void>,
     sessionId: string,
     accountId: string
 ): Promise<string | undefined> {
     const updatedExecutingFlow = await AgentFlowState.findById(executingFlowId, { messages: 1, _id: -1, companyId: 1, nodes: 1 });
     const lastUserMessage = updatedExecutingFlow?.messages?.slice().reverse().find(msg => msg.owner === "User");
     const finalQuery = lastUserMessage?.message || initialQuery;
     const nodeExists = updatedExecutingFlow?.nodes?.some(n => n.userAgentName === node.userAgentName);
 
     if (!nodeExists) {
 
         const currentNode: INode = {
             agentName: node.agentName,
             userAgentName: node.userAgentName,
             condition: node.condition,
             availableFunctions: node.availableFunctions,
             nodeState: "Running", 
         };
 
         await AgentFlowState.findOneAndUpdate(
             { _id: executingFlowId },
             { $push: { nodes: currentNode } },
             { new: true }
         );
 
     }
 
 
     const reactAgentService = new ReactAgentService(confirmationAwaiting);
     const companyId = updatedExecutingFlow?.companyId;
     const hardCodedFlowId = node?.userAgentName;
 
     if (!companyId) {
         console.error("Company ID not found for the flow.");
         await Log.findOneAndUpdate(
             { sessionId: sessionId },
             {
                 status: "COMPLETED_WITH_ERROR",
                 $push: {
                     steps: {
                         type: "FLOW_ERROR",
                         content: "Company ID not found for the flow.",
                         timestamp: new Date(),
                     },
                 },
             }
         );
         return "Error";
     }
 
     const result = await reactAgentService.runReActAgent(
         {
             message: finalQuery,
             sender: userId,
             receiver: accountId
         },
         socket,
         companyId,
         agentId,
         hardCodedFlowId
     );
 await AgentFlowState.findOneAndUpdate(
         {
             _id: executingFlowId,
             "nodes.userAgentName": node.userAgentName
         },
         { $set: { "nodes.$.nodeState": "Completed" } },
         { new: true }
     );
     await Log.findOneAndUpdate(
         { sessionId: sessionId },
         {
             $push: {
                 steps: {
                     type: "REACT_AGENT_REDIRECT",
                     content: `Redirected to ReAct Agent.`,
                     timestamp: new Date(),
                 },
             },
         }
     );
     if(result === "complete" && node?.condition.length >0){
         if(node?.condition.length === 1){
 
             return node?.condition[0].executeUserAgent;
         }
     }
     return "nodered flow ended.";
 }
 export class ToolExecutor {
     private availableTool: Tool | null;
     private executingFlowObject: IAgentFlowState | null;
     private node: FlowNode | null;
     private history: Message[];
     private sessionId:string;
     public static llmModel: string;
     public static llmService: string;
  
     private constructor(tool: Tool, node: FlowNode,sessionId:string) {
         this.availableTool = tool;
         this.node = node;
         this.executingFlowObject = null;
         this.history = [];
         this.sessionId=sessionId
     }
     public static async assignLLMProperty(flowId:string){
        if(!flowId){
            console.log('flowId not found')
        }
        
        const flow = await AgentFlow.findOne({_id:flowId},{llmModel:1,llmService:1,_id:-1})
            if (flow) {
        this.llmModel = flow.llmModel;
        this.llmService = flow.llmService;
    }
        
     }
 
     // A static factory method for creating and running the executor
     public static async executeTools(
         tool: any,
         executingFlowId: string,
         query: string,
         node: FlowNode,
         sessionId:string,
         flowId:string
     ): Promise<string | number | undefined> {
         
         const executor = new ToolExecutor(tool, node,sessionId);
         this.assignLLMProperty(flowId)
         await executor.updateFlowDocumentAndState(executingFlowId);
         const result = await executor.functionalAgent(query, executingFlowId);
 
         return result === null ? undefined : result;
     }
 
     // This method combines updateAgentFlowState and updateExecutingFlowDocument
     private async updateFlowDocumentAndState(executingFlowId: string): Promise<void> {
         if (!this.node || !this.availableTool) {
             console.error("Error: Node or tool is not set.");
             return;
         }
 
         const existingFlow = await AgentFlowState.findById(executingFlowId);
         if (!existingFlow) {
             console.error("Error: Executing flow not found.");
             return;
         }
 
         const nodeExists = existingFlow.nodes?.some(n => n.userAgentName === this.node?.userAgentName);
         const variableExists = existingFlow.variables?.some(v => v.userAgentName === this.node?.userAgentName);
 
         if (nodeExists && variableExists) {
             this.executingFlowObject = existingFlow as unknown as IAgentFlowState;
             return;
         }
 
         const update: any = { $set: { flowState: "running" }, $push: {} };
 
         if (!nodeExists) {
             const currentNode: INode = {
                 agentName:this.node.agentName,
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
           
             const newVariableEntry = {
                 state: false,
                 userAgentName: this.node.userAgentName,
                 tool: this.availableTool.toolName,
                 functionParameters,
             };
             update.$push.variables = newVariableEntry;
         }
 
         const updatedFlow = await AgentFlowState.findOneAndUpdate(
             { _id: executingFlowId },
             Object.keys(update.$push).length > 0 ? update : { $set: update.$set },
             { new: true, upsert: false }
         );
 
         if (updatedFlow) {
             this.executingFlowObject = updatedFlow as unknown as IAgentFlowState;
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
           
             const agentFlow = await AgentFlowState.findById(executingFlowId);
             const latestVariableEntry = agentFlow?.variables?.find(v => v.userAgentName === this.node?.userAgentName);
 
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
             await this.updateParametersInDb(executingFlowId,latestVariableEntry.userAgentName as string,updatedFunctionParameters,allParametersFilled
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
        
        
        const llmService = new LLMService(ToolExecutor.llmService);
         const prompt = this.createLLMPrompt(latestVariableEntry);
         this.history.push({ role: "user", content: query });
         return llmService.call(prompt, this.history, query,ToolExecutor.llmModel);
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
     // executingFlowId se poora document nikal lein
     const executingFlow = await AgentFlowState.findById(executingFlowId);
 
     // Agar executingFlow milta hai to sessionId use karein
     const sessionId = this.sessionId; // Assume kar rahe hain ki sessionId ExecutingagentFlow schema mein hai
 
     await AgentFlowState.findOneAndUpdate(
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
     if (allParametersFilled && sessionId) {
         await Log.findOneAndUpdate(
             { sessionId: sessionId },
             {
                 $push: {
                     steps: {
                         type: "PARAMETERS_GATHERED",
                         content: `All parameters are gathered.`,
                         timestamp: new Date(),
                     },
                 },
             }
         );
       
     }
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
         
         await AgentFlowState.findOneAndUpdate(
             { _id: executingFlowId },
             { $set: { "nodes.$[elem].nodeState": "Completed" } },
             { new: true, arrayFilters: [{ "elem.userAgentName": this.node?.userAgentName }] }
         );
         const sessionId = this.sessionId
                 await Log.findOneAndUpdate(
             { sessionId: sessionId },
             {
                 $push: {
                     steps: {
                         type: "node executed",
                         content: `node execution completed with result ${executionResult}.`,
                         timestamp: new Date(),
                     },
                 },
             }
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
         await AgentFlowState.findOneAndUpdate(
             { _id: this.executingFlowObject?.id },
             { $push: { messages: messageObject } },
             { new: true }
         );
         return "PROMPT_REQUIRED";
     }
 
     private async getNextNodeIdFromLLM(result: any, conditions: any[]): Promise<string> {
         const llmService = new LLMService(ToolExecutor.llmService);
         const prompt = `The result of node execution is ${result}. Here are the available conditions: ${JSON.stringify(conditions)}. Based on the result, which condition is met? Return only the 'executeAgent' value of the satisfied condition. For example, if the result is 30, and a condition says "result should be smaller than 50", you should return the corresponding 'executeAgent' ID. Return only the ID, nothing else.`;
         const llmResponse = await llmService.call(prompt, this.history, `Result: ${result}`,ToolExecutor.llmModel);
         return llmResponse.trim();
     }
 
     private async saveMessage(content: string) {
         const message: IMesssage = { message: content, owner: "System" };
         await AgentFlowState.findOneAndUpdate(
             { _id: this.executingFlowObject?.id },
             { $push: { messages: message } },
             { new: true }
         );
     }
 }