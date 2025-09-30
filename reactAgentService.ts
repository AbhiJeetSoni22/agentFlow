

import { Socket } from 'socket.io';
import { ReActAgent } from '../reactAgent';
import { ToolExecutor } from '../toolExecuter';
import { Log } from '../../models/Log';
import { v4 as uuidv4 } from 'uuid';
import { saveMessage } from '../../controllers';
import { ACCOUNT_TYPE } from '../../constants';
import { SocketEntity } from '../../entity/socket.entity';

// Yeh class ReAct Agent se sambandhit logic ko manage karegi
export class ReactAgentService {
    private agentInstances: Map<string, ReActAgent> = new Map();
    private executorInstances: Map<string, ToolExecutor> = new Map();
    private confirmationAwaiting: Map<string, (response: string) => void>;

    // Constructor mein confirmationAwaiting map ko receive karein
    constructor(confirmationAwaiting: Map<string, (response: string) => void>) {
        this.confirmationAwaiting = confirmationAwaiting;
    }

    public async runReActAgent(
        chatMessage: any,
        socket: Socket,
        companyId: string,
        agentId: string,
        agentFlowId?: string // Yeh hardcoded flow ID ho sakta hai
    ) {
        try {

           let agent = this.agentInstances.get(companyId);
            let toolExecutor = this.executorInstances.get(companyId);
    
            if (!agent || !toolExecutor) {
                console.log(`[ReAct] Initializing new Agent and Executor for Company ID: ${companyId}`);
                socket.emit("receiveMessageToUser", {
                    message: "Initializing agent...",
                    sender: chatMessage.receiver,
                    receiver: chatMessage.sender,
                });
                
                // 🔥 START: NEW LOGIC FOR PASSING HARDCODED IDs
                // hardCodedAgentId: Agar agentFlowId mila hai, toh agentId ko hardcodedAgentId manenge, varna undefined.
                // hardCoadedFlowId: agentFlowId ko pass kiya jayega.
                console.log('company id ',companyId);
                console.log('agentId is',agentId);
                console.log('agentFlowId',agentFlowId)
                
                agent = await ReActAgent.create(companyId); // Updated create call
                toolExecutor = await ToolExecutor.create(companyId);
                // 🔥 END: NEW LOGIC FOR PASSING HARDCODED IDs
                
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
                        "AGENT",
                        agentId
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
                agentId,
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
            console.log('sending react message ',chatMessage.message)
            await agent.run(
                chatMessage.message,
                toolExecutor,
                socket,
                askUser,
                companyId,
                agentId,
                endUserId,
                sessionId,
                chatMessage.sender,
                chatMessage.receiver
            );
            
            return 'complete'
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
        steps: [
          {
            stepNumber: 1,
            type: "QUERY",
            content: `User initiated with query: "${chatMessage.message}"`,
            timestamp: new Date(),
          },
        ],
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
      console.error(
        "[ReAct] A critical error occurred in the agent flow:",
        error
      );
      socket.emit("receiveMessageToUser", {
        message: `An unexpected error occurred: ${error.message}`,
        sender: chatMessage.receiver,
        receiver: chatMessage.sender,
      });
    }
  }
}
