// src/services/reactAgentService.ts

import { Socket } from 'socket.io';
import { ReActAgent } from '../reactAgent';
import { ToolExecutor } from '../toolExecuter';
import { Log } from '../../models/Log';
import { v4 as uuidv4 } from 'uuid';
import { saveMessage } from '../../controllers';
import { ACCOUNT_TYPE } from '../../constants';
import { SocketEntity } from '../../entity/socket.entity';

export class ReactAgentService {
    private agentInstances: Map<string, ReActAgent> = new Map();
    private executorInstances: Map<string, ToolExecutor> = new Map();
    private confirmationAwaiting: Map<string, (response: string) => void>;

    constructor(confirmationAwaiting: Map<string, (response: string) => void>) {
        this.confirmationAwaiting = confirmationAwaiting;
    }

    public async runReActAgent(
        chatMessage: any,
        socket: Socket,
        companyId: string,
        botId: string,
        botFlowId?: string
    ) {
        try {
            console.log("ReAct agent started from ReactAgentService  and chatmessage is .",chatMessage);
         
            let agent = this.agentInstances.get(companyId);
            let toolExecutor = this.executorInstances.get(companyId);

            if (!agent || !toolExecutor) {
                console.log(`[ReAct] Initializing new Agent and Executor for Company ID: ${companyId}`);
                socket.emit("receiveMessageToUser", {
                    message: "Initializing agent...",
                    sender: chatMessage.receiver,
                    receiver: chatMessage.sender,
                });
                console.log('value of userdefined flowId is',botFlowId)
                agent = await ReActAgent.create(companyId,botFlowId);
                toolExecutor = await ToolExecutor.create(companyId);
                this.agentInstances.set(companyId, agent);
                this.executorInstances.set(companyId, toolExecutor);
                socket.emit("receiveMessageToUser", {
                    message: "Agent Is Ready",
                    sender: chatMessage.receiver,
                    receiver: chatMessage.sender,
                });
            }

            const askUser = (question: string): Promise<string> => {
                return new Promise(async (resolve) => {
                    await saveMessage(
                        question,
                        chatMessage.receiver,
                        chatMessage.sender,
                        companyId,
                        ACCOUNT_TYPE.LIVE_CHAT,
                        "BOT",
                        botId
                    );
                    socket.emit("receiveMessageToUser", {
                        message: question,
                        sender: chatMessage.receiver,
                        receiver: chatMessage.sender,
                    });
                    this.confirmationAwaiting.set(socket.id, resolve);
                });
            };

            const endUserId = chatMessage.sender;
            const sessionId = uuidv4();
            const agentLog = new Log({
                companyId,
                botId,
                endUserId,
                sessionId,
                initialQuery: chatMessage.message,
                status: "RUNNING",
                logType: "REACT_AGENT",
                steps: [{
                    stepNumber: 1,
                    type: "QUERY",
                    content: `User initiated with query: "${chatMessage.message}"`,
                    timestamp: new Date(),
                }],
            });
            await agentLog.save();

            await agent.run(
                chatMessage.message,
                toolExecutor,
                socket,
                askUser,
                companyId,
                botId,
                endUserId,
                sessionId,
                chatMessage.sender,
                chatMessage.receiver
            );
        } catch (error: any) {
            console.error("[ReAct] A critical error occurred in the agent flow:", error);
            socket.emit("receiveMessageToUser", {
                message: `An unexpected error occurred: ${error.message}`,
                sender: chatMessage.receiver,
                receiver: chatMessage.sender,
            });
        }
    }
}