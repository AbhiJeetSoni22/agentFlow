// src/services/reactAgent.ts
import { ITool, IStandardTool, IBotFLow } from '../interfaces';
import { ReactAgentBotState, IReactAgentBotState, ToolModel, StandardToolModel, BotFlow } from '../models';
import { LLMService } from './llmService';
import { ToolExecutor } from "./toolExecuter";
import { Socket } from "socket.io";
import { Log } from '../models';


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

        console.log(logWithSteps);
        log.markModified("steps");
        await log.save();
    }
}

type ParsedResponse = { thought: string; toolActions: { toolId: string }[] };

export class ReActAgent {
    // Ye properties har `run` call pe update hongi
    private dynamicTools: ITool[];
    private botFlow: IBotFLow | null;
    public github_auth_token: string | null = null;
    public companyId: string;
public hardcodedFlowId: string | null = null;
    // Constructor ko simplify kiya gaya
    private constructor(companyId: string) {
        this.companyId = companyId;
        this.dynamicTools = [];
        this.botFlow = null;
    }

    // Create method ab sirf instance banata hai, data fetch nahi karta
    public static async create(companyId: string,hardcodedFlowId?: string): Promise<ReActAgent> {
                   const agent = new ReActAgent(companyId);
        if (hardcodedFlowId ) {
            agent.hardcodedFlowId = hardcodedFlowId;
        }
        await agent._loadLatestBotFlowAndTools();
        return agent;
    }

    // Ye naya private method har run ke shuru mein latest config layega
    private async _loadLatestBotFlowAndTools() {
        console.log(`[ReAct Flow Loader] Fetching latest published REACT BotFlow for companyId: ${this.companyId}`);
        
        // Step 1: React Agent ka latest published BotFlow fetch karo
         let botFlowQuery: any = { companyId: this.companyId, flowType: 'REACT', flowState: 'PUBLISH' };
        
        // Agar hardcoded ID hai, to query ko override karein
        if (this.hardcodedFlowId) {
            console.log(`[ReAct Flow Loader] Overriding query with hardcoded flow ID: ${this.hardcodedFlowId}`);
            botFlowQuery = { _id: this.hardcodedFlowId };
        }
        console.log('running hardcoadedFlowId ',this.hardcodedFlowId)
        const botFlow = await BotFlow.findOne(botFlowQuery);
        if (!botFlow || !botFlow.reactAgent) {
            throw new Error(`[ReAct Agent Run] No published REACT BotFlow found for companyId: ${this.companyId}`);
        }
        this.botFlow = botFlow;

        // Step 2: Flow se tool IDs nikalo
        const toolIds = botFlow.reactAgent.tools || [];
        if (toolIds.length === 0) {
            console.warn(`[ReAct Agent Run] No tools specified in the latest BotFlow for companyId: ${this.companyId}`);
            this.dynamicTools = [];
            return;
        }

        // Step 3: Sirf vahi tools fetch karo jinki ID 'tools' array mein hai
        // YEH LINE AUTOMATICALLY MISSING TOOLS KO IGNORE KAR DETI HAI
        const validTools = await ToolModel.find({ '_id': { $in: toolIds } });
        
        if (validTools.length !== toolIds.length) {
            console.warn(`[ReAct Agent Run] Some tool IDs from BotFlow were not found in the Tools collection and have been skipped.`);
        }

        // Step 4: Agent ki properties ko latest tools se update karo
        this.dynamicTools = validTools as any[];
        console.log(`[ReAct Flow Loader] Successfully loaded ${this.dynamicTools.length} tools.`);
    }

    private async _getResolvedToolForStateInit(toolId: string, companyId: string): Promise<(ITool | IStandardTool) | null> {
        if (!toolId || !toolId.match(/^[0-9a-fA-F]{24}$/)) {
            console.error(`[ReActAgent State Init] Invalid toolId format: ${toolId}. Skipping resolution.`);
            return null;
        }

        const isMcpSubTool = await ToolModel.findOne({
            companyId,
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
            const llmService = new LLMService("grok");
            const prompt = `Convert this technical JSON observation into a friendly, one-sentence message for a user. Be polite and clear.
                      Technical observation: "${technicalObservation}"
                      Friendly message:`;
            return await llmService.callGrok(prompt, [], "", "grok-3-mini-fast");
        } catch (e) {
            return technicalObservation;
        }
    }
    
    private createPrompt(
        query: string,
        history: string
    ): string {
        if (!this.botFlow || !this.botFlow.reactAgent || !this.botFlow.reactAgent.systemPrompt) {
            throw new Error("BotFlow or system prompt is not loaded correctly.");
        }
        const reactAgentConfig = this.botFlow.reactAgent;

        const toolsArray = this.dynamicTools.reduce((descriptions, tool) => {
            if (
                tool.toolType === "MCP" &&
                tool.toolConfig &&
                Array.isArray(tool.toolConfig.tools)
            ) {
                if (tool.toolConfig.auth) {
                    this.github_auth_token = tool.toolConfig.auth;
                }
                const mcpSubTools = tool.toolConfig.tools.map(
                    (subTool: any) => `- {"toolId": "${subTool.toolId}", "toolName": "${subTool.toolName}", "description": "${subTool.toolDescription}"}`
                );
                return descriptions.concat(mcpSubTools);
            } else {
                descriptions.push(`- {"toolId": "${tool._id}", "toolName": "${tool.toolName}", "description": "${tool.toolDescription}"}`);
                return descriptions;
            }
        }, [] as string[]).join("\n");
        
        let systemPrompt = reactAgentConfig.systemPrompt;
        systemPrompt = systemPrompt.replace(/\$\{toolsArray\}/g, toolsArray);
        systemPrompt = systemPrompt.replace(/\$\{history \|\| "No history yet\."\}/g, history || "No history yet.");
        systemPrompt = systemPrompt.replace(/\$\{query\}/g, query);

        const userPrompt = reactAgentConfig.userPrompt || "Now, generate your response for the current user query.";
        const finalPrompt = `${systemPrompt}\n\n${userPrompt}`;

        console.log("Final Prompt:\n", finalPrompt);  

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

    public async run(
        query: string,
        toolExecutor: ToolExecutor,
        socket: Socket,
        askUser: (question: string) => Promise<string>,
        companyId: string,
        botId: string,
        endUserId: string,
        sessionId: string,
        receiverId: string,
        senderId: string
    ): Promise<void> {
        
        // Har run se pehle latest BotFlow aur tools fetch karo
        try {
            await this._loadLatestBotFlowAndTools();
        } catch (error: any) {
            console.error("[ReAct PRE-RUN] Failed to load BotFlow and Tools:", error.message);
            socket.emit('receiveMessageToUser', {
                message: "Sorry, I couldn't set up my tools correctly. Please contact support. 🛠️",
                sender: senderId,
                receiver: receiverId,
            });
            await Log.findOneAndUpdate({ sessionId }, { status: 'FAILED' });
            return; // Run ko yahin rok do
        }

        console.log(`[ReAct START] Processing query for user: ${endUserId}`);
        let state = await ReactAgentBotState.create({
            companyId,
            botId,
            endUserId,
            status: 'running',
            currentPhase: 'THOUGHT',
            steps: [],
            toolExecutions: [],
            parameters: new Map<string, any>()
        });

        let iterations = 0;
        const maxIterations = 15;
        while (state.status === 'running' && iterations < maxIterations) {
            iterations++;
            console.log(`\n[ReAct Loop] Iteration: ${iterations}, Phase: ${state.currentPhase}`);
            try {
                switch (state.currentPhase) {
                    case 'THOUGHT':
                        await this.executeThoughtPhase(state, query, socket, sessionId);
                        break;
                    case 'ACTION':
                        await this.executeActionPhase(endUserId, state, toolExecutor, socket, askUser, query, sessionId);
                        break;
                    default:
                        state.status = 'completed';
                }
                const reloadedState = await ReactAgentBotState.findById(state._id);
                if (!reloadedState) throw new Error("State disappeared from DB.");
                state = reloadedState;
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

    private async executeThoughtPhase(state: IReactAgentBotState, query: string, socket: Socket, sessionId: string) {
        if (!this.botFlow || !this.botFlow.reactAgent) {
            throw new Error("BotFlow is not loaded, cannot execute thought phase.");
        }
        
        console.log(`[ReAct] ==> Phase: THOUGHT`);
        socket.emit('agent log', { type: 'system', message: 'Agent is thinking... 🤔' });

        const history = state.steps.map(s => `${s.type.toUpperCase()}: ${s.content}`).join("\n");
        const prompt = this.createPrompt(query, history);
        
        const { llmService: llmServiceName, llmModel: llmModelName } = this.botFlow.reactAgent;
        const llmService = new LLMService(llmServiceName);
        const aiResponse = await llmService.callGrok(prompt, [], query, llmModelName);

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
                const toolDetails = await this._getResolvedToolForStateInit(action.toolId, state.companyId);
                if (toolDetails) {
                    actionDetails.push(`{ toolId: ${action.toolId}, toolName: "${(toolDetails as any).toolName}", description: "${(toolDetails as any).toolDescription}" }`);
                } else {
                    actionDetails.push(`{ toolId: ${action.toolId} (details not found) }`);
                }
            }
            actionContent += actionDetails.join('; ');

            state.steps.push({ type: 'action', content: actionContent } as any);
            
            for (const action of toolActions) {
                const toolDetails = await this._getResolvedToolForStateInit(action.toolId, state.companyId);
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

    private async executeActionPhase(endUserId: string, state: IReactAgentBotState, toolExecutor: ToolExecutor, socket: Socket, askUser: (q: string) => Promise<string>, initialQuery: string, sessionId: string) {
        console.log(`[ReAct] ==> Phase: ACTION`);
        const pendingExecutions = state.toolExecutions.filter(te => te.status === 'pending');
        if (pendingExecutions.length === 0) {
            state.currentPhase = 'THOUGHT';
            await state.save();
            return;
        }

        const lastThought = state.steps.filter(s => s.type === 'thought').pop();

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

        const toolActionsToExecute = pendingExecutions.map(t => ({ toolId: t.toolId }));
        console.log("pending tool actions to execute:", toolActionsToExecute);
        const results = await toolExecutor.executeTools(
            toolActionsToExecute,
            initialQuery,
            askUser,
            (state._id as any).toString(),
            endUserId,
            this.github_auth_token,
            sessionId
        );
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const toolId = toolActionsToExecute[i].toolId;
            const technicalObservation = result.success ? (result.observation ?? "Success") : `Error: ${result.error ?? "Unknown error"}`;
            const friendlyObservation = await this.getFriendlyObservation(technicalObservation);
            
            const toolDetails = await this._getResolvedToolForStateInit(toolId, state.companyId);
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

            socket.emit('agent log', { type: 'observation', message: friendlyObservation, success: result.success });
        }
        state.currentPhase = 'THOUGHT';
        await state.save();
    }
}