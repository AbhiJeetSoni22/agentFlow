// src/services/reactAgent.ts
import { ITool, IStandardTool, IAgentFLow } from '../interfaces';
import { ReactAgentAgentState, IReactAgentState, ToolModel, StandardToolModel, AgentFlow } from '../models';
import { LLMService } from './llmService';
import { ToolExecutor } from "./toolExecuter";
import { Socket } from "socket.io";
import { Log } from '../models';

// No changes to addLogStep or ParsedResponse
async function addLogStep(sessionId: string, stepData: Omit<any, 'stepNumber' | '_id' | 'timestamp'>) {
    const log = await Log.findOne({ sessionId });
    if (log) {
        const logWithSteps = log as any; // Type assertion to access 'steps'
        const nextStepNumber = logWithSteps.steps.length + 1;
        logWithSteps.steps.push({
            ...stepData,
            stepNumber: nextStepNumber,
            timestamp: new Date()
        } as any);
        log.markModified("steps");
        await log.save();
    }
}
type ParsedResponse = { thought: string; toolActions: { toolId: string }[] };


export class ReActAgent {
    // Ye properties har `run` call pe update hongi
    private dynamicTools: ITool[];
    private agentFlow: IAgentFLow | null;
    public companyId: string;
    public hardcodedFlowId?: string; // Added property

    private constructor(companyId: string) {
        this.companyId = companyId;
        this.dynamicTools = [];
        this.agentFlow = null;
    }

  
    public static async create(
    companyId: string,
    hardcodedFlowId?: string,
    agentId?: any
  ): Promise<ReActAgent> {
    const agent = new ReActAgent(companyId);
    if (hardcodedFlowId) {
      agent.hardcodedFlowId = hardcodedFlowId;
    }
    await agent._loadLatestAgentFlowAndTools(agentId);
    return agent;
  }
    private async _loadLatestAgentFlowAndTools(agentId: any) {
        console.log(`[ReAct Flow Loader] Fetching latest published REACT AgentFlow for agentId: ${agentId}`);
        const agentFlow = await AgentFlow.findOne({ agentId: agentId, flowType: 'REACT', flowState: 'PUBLISH' });
        if (!agentFlow || !agentFlow.reactAgent) {
            throw new Error(`[ReAct Agent Run] No published REACT AgentFlow found for agentId: ${agentId}`);
        }
        this.agentFlow = agentFlow;
        const toolIds = agentFlow.reactAgent.tools || [];
        if (toolIds.length === 0) {
            console.warn(`[ReAct Agent Run] No tools specified in the latest AgentFlow for agentId: ${agentId}`);
            this.dynamicTools = [];
            return;
        }
        const validTools = await ToolModel.find({ '_id': { $in: toolIds } });
        if (validTools.length !== toolIds.length) {
            console.warn(`[ReAct Agent Run] Some tool IDs from AgentFlow were not found in the Tools collection and have been skipped.`);
        }
        this.dynamicTools = validTools as any[];
        console.log(`[ReAct Flow Loader] Successfully loaded ${this.dynamicTools.length} tools.`);
    }
    private async _getResolvedToolForStateInit(toolId: string, companyId: string, agentId: string): Promise<(ITool | IStandardTool) | null> {
        if (!toolId || !toolId.match(/^[0-9a-fA-F]{24}$/)) {
            console.error(`[ReActAgent State Init] Invalid toolId format: ${toolId}. Skipping resolution.`);
            return null;
        }
        const isMcpSubTool = await ToolModel.findOne({
            agentId: agentId,
            toolType: 'MCP',
            'toolConfig.tools.toolId': toolId
        });
        if (isMcpSubTool) {
            console.log(`[ReActAgent State Init] Tool '${toolId}' is an MCP sub-tool. Fetching from Standard Tools.`);
            return await StandardToolModel.findById(toolId);
        }
        console.log(`[ReActAgent State Init] Tool '${toolId}' is a standard API/CRM tool. Fetching from Tools.`);
        return await ToolModel.findById(toolId);
    }
    private async getFriendlyObservation(technicalObservation: string): Promise<string> {
        if (technicalObservation.toLowerCase().startsWith('error:')) {
            return technicalObservation;
        }
        try {
            if (!this.agentFlow || !this.agentFlow.reactAgent || !this.agentFlow.reactAgent.llmService) {
                console.warn("[getFriendlyObservation] AgentFlow with LLM configuration is not loaded. Falling back to technical observation.");
                return technicalObservation;
            }
            
            const { llmService: llmServiceName, llmModel: llmModelName } = this.agentFlow.reactAgent;
            const llmService = new LLMService(llmServiceName);

            const systemPrompt = `Convert this technical JSON observation into a friendly, one-sentence message for a user. Be polite and clear.`;
            const userMessage = `Technical observation: "${technicalObservation}" Friendly message:`;
            
            return await llmService.call(systemPrompt, [], userMessage, llmModelName || undefined);
        } catch (e: any) {
            console.error(`[getFriendlyObservation] Error while converting observation to friendly message: ${e.message}`);
            return technicalObservation;
        }
    }

    private createPrompt(
        query: string,
        steps: any[]
    ): string {
        if (!this.agentFlow || !this.agentFlow.reactAgent || !this.agentFlow.reactAgent.systemPrompt) {
            throw new Error("AgentFlow or system prompt is not loaded correctly.");
        }
        const reactAgentConfig = this.agentFlow.reactAgent;

        const toolsArray = this.dynamicTools.reduce((descriptions, tool) => {
            if (
                tool.toolType === "MCP" &&
                tool.toolConfig &&
                Array.isArray(tool.toolConfig.tools)
            ) {
                const mcpSubTools = tool.toolConfig.tools.map(
                    (subTool: any) => `- {"toolId": "${subTool.toolId}", "toolName": "${subTool.toolName}", "description": "${subTool.toolDescription}"}`
                );
                return descriptions.concat(mcpSubTools);
            } else {
                descriptions.push(`- {"toolId": "${tool._id}", "toolName": "${tool.toolName}", "description": "${tool.toolDescription}"}`);
                return descriptions;
            }
        }, [] as string[]).join("\n");

        const historyForHistorySection = (steps || []).map((s: any) => `${s.type.toUpperCase()}: ${s.content}`).join("\n");
        const queryArray = [];
        queryArray.push({ "user_query": query });
        let currentTurn: { action?: string; observation?: string } = {};
        for (const step of steps) {
            if (step.type === 'action') {
                if (currentTurn.action) queryArray.push(currentTurn);
                currentTurn = { action: step.content };
            } else if (step.type === 'observation' && currentTurn.action) {
                currentTurn.observation = step.content;
                queryArray.push(currentTurn);
                currentTurn = {};
            }
        }
        const historyForQuerySection = JSON.stringify(queryArray, null, 2);
        let systemPrompt = reactAgentConfig.systemPrompt;
        systemPrompt = systemPrompt.replace(/\$\{toolsArray\}/g, toolsArray);
        systemPrompt = systemPrompt.replace(/\$\{history \|\| "No history yet\."\}/g, historyForHistorySection || "No history yet.");
        systemPrompt = systemPrompt.replace(/\$\{query\}/g, historyForQuerySection);
        const userPrompt = reactAgentConfig.userPrompt || "Now, generate your response for the current user query.";
        const finalPrompt = `${systemPrompt}\n\n${userPrompt}`;
        return finalPrompt;
    }

    private parseAIResponse(response: string): ParsedResponse | null {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error("AI Response was not a JSON object. Response received:", response);
                throw new Error("No JSON object found in the response.");
            }
            let jsonString = jsonMatch[0];
            if (jsonString.startsWith("```json")) {
                jsonString = jsonString.substring(7, jsonString.length - 3).trim();
            }
            const parsed = JSON.parse(jsonString);
            return {
                thought: parsed.thought || "",
                toolActions: Array.isArray(parsed.toolActions) ? parsed.toolActions.map((a: any) => ({ toolId: a.toolId || a.toolName || a.tool })) : [],
            };
        } catch (e: any) {
            console.error("Failed to parse JSON response from AI:", e.message);
            return null;
        }
    }
    public async run(query: string, toolExecutor: ToolExecutor, socket: Socket, askUser: (question: string) => Promise<string>, companyId: string, agentId: string, endUserId: string, sessionId: string, receiverId: string, senderId: string): Promise<void> {
        try {
            await this._loadLatestAgentFlowAndTools(agentId);
        } catch (error: any) {
            console.error("[ReAct PRE-RUN] Failed to load AgentFlow and Tools:", error.message);
            socket.emit('receiveMessageToUser', {
                message: "Sorry, I couldn't set up my tools correctly. Please contact support. 🛠️",
                sender: senderId,
                receiver: receiverId,
            });
            await Log.findOneAndUpdate({ sessionId }, { status: 'FAILED' });
            return;
        }
        let findAgentState = await ReactAgentAgentState.findOne({ companyId, agentId, endUserId, status: 'running' });
        let state;
        if (!findAgentState) {
            state = await ReactAgentAgentState.create({
                companyId,
                agentId,
                endUserId,
                status: 'running',
                currentPhase: 'THOUGHT',
                steps: [],
                toolExecutions: [],
                parameters: new Map<string, any>()
            });
        }
        else {
            state = findAgentState;
        }
        let iterations = 0;
        const maxIterations = 15;
        while (state.status === 'running' && iterations < maxIterations) {
            iterations++;
            console.log(`\n[ReAct Loop] Iteration: ${iterations}, Phase: ${state.currentPhase}`);
            try {
                switch (state.currentPhase) {
                    case 'THOUGHT':
                        await this.executeThoughtPhase(state, query, socket, sessionId, agentId, endUserId);
                        break;
                    case 'ACTION':
                        await this.executeActionPhase(endUserId, state, toolExecutor, socket, askUser, query, sessionId, agentId);
                        break;
                    default:
                        state.status = 'completed';
                }
                await state.save();
            } catch (error: any) {
                console.error("[ReAct] Critical error in loop:", error.message);
                state.status = 'failed';
                await state.save();
            }
        }
        if (iterations >= maxIterations) {
            console.error("[ReAct] Max iterations reached.");
            state.status = 'failed';
            await state.save();
        }
        console.log(`[ReAct END] Final status: ${state.status}`);
        if (state.status === 'completed') {
            socket.emit('receiveMessageToUser', {
                message: "The process has been completed successfully. ✅",
                sender: senderId,
                receiver: receiverId,
            });
        }
        await Log.findOneAndUpdate(
            { sessionId },
            { status: state.status === 'completed' ? 'COMPLETED' : 'FAILED' }
        );
    }
    private async executeThoughtPhase(state: IReactAgentState, query: string, socket: Socket, sessionId: string, agentId: string, endUserId: string) {
        if (!this.agentFlow || !this.agentFlow.reactAgent) {
            throw new Error("AgentFlow is not loaded, cannot execute thought phase.");
        }
        console.log(`[ReAct] ==> Phase: THOUGHT`);
        socket.emit('receiveMessageToUser', {
            message: `Thought: I am thinking about how to assist you with your request.`,
            sender: '684d9e2558457385a6558657',
            receiver: endUserId
        });
        const prompt = this.createPrompt(query, state.steps as any[]);
        
        const { llmService: llmServiceName, llmModel: llmModelName } = this.agentFlow.reactAgent;
        const llmService = new LLMService(llmServiceName);
        
        const aiResponse = await llmService.call(prompt, [], query, llmModelName);

        const parsed = this.parseAIResponse(aiResponse);
        if (!parsed) throw new Error('Could not parse thought from AI response.');
        const { thought, toolActions } = parsed;
        await addLogStep(sessionId, {
            type: 'THOUGHT',
            content: thought,
            metadata: {
                thought,
                rawApiResponse: aiResponse,
                prompt: prompt
            }
        } as unknown as any);
        state.steps.push({ type: 'thought', content: thought } as any);
        socket.emit('agent log', { type: 'thought', message: thought });
        if (toolActions.length === 0 || !toolActions[0]?.toolId) {
            console.log("[ReAct] Thought resulted in no valid action. Completing task.");
            state.status = 'completed';
            state.currentPhase = 'DONE';
        } else {
            let actionContent = 'Preparing to execute tools: ';
            const actionDetails = [];
            for (const action of toolActions) {
                const toolDetails = await this._getResolvedToolForStateInit(action.toolId, state.companyId, agentId);
                if (toolDetails) {
                    actionDetails.push(`{ toolId: ${action.toolId}, toolName: "${(toolDetails as any).toolName}", description: "${(toolDetails as any).toolDescription}" }`);
                } else {
                    actionDetails.push(`{ toolId: ${action.toolId} (details not found) }`);
                }
            }
            actionContent += actionDetails.join('; ');
            state.steps.push({ type: 'action', content: actionContent } as any);
            for (const action of toolActions) {
                const toolDetails = await this._getResolvedToolForStateInit(action.toolId, state.companyId, agentId);
                if (toolDetails) {
                    const paramsArray = Array.isArray((toolDetails as any)?.toolConfig?.dynamicParams) ? (toolDetails as any).toolConfig.dynamicParams : [];
                    const parameters = (paramsArray || []).filter((p: any) => p).map((p: any) => ({
                        variableName: p.key || p.variableName,
                        received: false,
                    }));
                    state.toolExecutions.push({
                        toolId: action.toolId,
                        status: 'pending',
                        parameters: parameters,
                        complete: parameters.length === 0
                    } as any);
                } else {
                    console.error(`[ReAct] Failed to resolve tool details for toolId: ${action.toolId}`);
                }
            }
            state.currentPhase = 'ACTION';
        }
        await state.save();
    }

    private async executeActionPhase(endUserId: string, state: IReactAgentState, toolExecutor: ToolExecutor, socket: Socket, askUser: (q: string) => Promise<string>, initialQuery: string, sessionId: string, agentId: string) {
        console.log(`[ReAct] ==> Phase: ACTION`);
        const pendingExecutions = state.toolExecutions.filter((te: any) => te.status === 'pending');
        if (pendingExecutions.length === 0) {
            state.currentPhase = 'THOUGHT';
            await state.save();
            return;
        }

        const lastThought = state.steps.filter((s: any) => s.type === 'thought').pop();

        if (lastThought && lastThought.content) {
            console.log(`[ReAct DEBUG] Thought mila hai user ko bhejne ke liye: "${lastThought.content}"`);
            socket.emit('receiveMessageToUser', {
                message: `Thought: ${lastThought.content}`,
                sender: '684d9e2558457385a6558657',
                receiver: endUserId
            });
        } else {
            console.log("[ReAct DEBUG] User ko bhejne ke liye koi thought nahi mila.");
        }
        

        if (!this.agentFlow || !this.agentFlow.reactAgent) {
            throw new Error("Cannot execute tools without a loaded agent flow.");
        }
        const { llmService: llmServiceName, llmModel: llmModelName } = this.agentFlow.reactAgent;
        // <<< END: MODIFIED SECTION >>>

        for (const execution of pendingExecutions) {
            const toolId = (execution as any).toolId;
            console.log(`[ReAct ACTION] Preparing to execute tool: ${toolId}`);

            let authToken: string | null = null;
            const parentMcpTool = this.dynamicTools.find(tool =>
                tool.toolType === 'MCP' &&
                tool.toolConfig?.tools?.some((subTool: any) => subTool.toolId === toolId)
            );

            if (parentMcpTool && parentMcpTool.toolConfig.auth) {
                authToken = parentMcpTool.toolConfig.auth;
                console.log(`[ReAct ACTION] Found auth token for tool ${toolId} from parent MCP tool '${parentMcpTool.toolName}'.`);
            } else {
                console.log(`[ReAct ACTION] No specific auth token found for tool ${toolId}. Proceeding without one.`);
            }

            const toolActionsToExecute = [{ toolId: toolId }];
            const results = await toolExecutor.executeTools(
                toolActionsToExecute,
                initialQuery,
                askUser,
                (state._id as any).toString(),
                endUserId,
                authToken,
                sessionId,
                agentId,
            );

            if (results && results.length > 0) {
                const result = results[0];
                const technicalObservation = result.success ? (result.observation ?? "Success") : `Error: ${result.error ?? "Unknown error"}`;
                const friendlyObservation = await this.getFriendlyObservation(technicalObservation);

                const toolDetails = await this._getResolvedToolForStateInit(toolId, state.companyId, agentId);
                const toolName = toolDetails ? (toolDetails as any).toolName : 'Unknown Tool';
                const toolDescription = toolDetails ? (toolDetails as any).toolDescription : 'No description available.';

                state.steps.push({
                    type: "observation",
                    content: technicalObservation,
                    toolId: toolId,
                    toolName: toolName,
                    toolDescription: toolDescription,
                    success: result.success,
                } as any);

                socket.emit('receiveMessageToUser', {
                    message: `Observation: ${friendlyObservation}`,
                    sender: '684d9e2558457385a6558657',
                    receiver: endUserId
                });
            } else {
                console.error(`[ReAct ACTION] Tool execution for ${toolId} did not return any results.`);
                state.steps.push({
                    type: "observation",
                    content: `Error: Tool execution for ${toolId} failed to produce a result.`,
                    toolId: toolId,
                    toolName: 'Unknown Tool',
                    toolDescription: 'Execution failed internally.',
                    success: false,
                } as any);
            }

            const executionIndex = state.toolExecutions.findIndex((te: any) => te.toolId === toolId && te.status === 'pending');
            if (executionIndex > -1) {
                (state.toolExecutions[executionIndex] as any).status = 'completed';
            }
        }

        state.currentPhase = 'THOUGHT';
        await state.save();
    }
}