// src/entities/socket.entity.ts

import { Server, Socket } from "socket.io";
import mongoose from "mongoose";
import { ReActAgent } from '../services/reactAgent';
import { ToolExecutor } from '../services/toolExecuter';
import { Log } from "../models";
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../services/llmService';


import { receiveMessageFromBot, saveMessage } from "../controllers";
import {
    AccountDeatilsEntity, Kritrim, LogEntity, BotEntity, endUserEntity, AuthEntity,
    NodeRedEntity, BotFlowEntity, NodeRedLogsEntity, OrchestrationAgentEntity, AgenticEntity
} from "./index";
import { ACCOUNT_TYPE } from "../constants";
import { sendWhatsAppMessage } from "../services";
import { accountDeatils, UserModel, BotState, BotFlow } from "../models";


export class SocketEntity {

    private agentInstances: Map<string, ReActAgent> = new Map();
    private executorInstances: Map<string, ToolExecutor> = new Map();
    private confirmationAwaiting: Map<string, (response: string) => void> = new Map();
    private botEntity = new BotEntity();
    private kritrimService = new Kritrim();
    private logService = new LogEntity();
    private accountDetailsService = new AccountDeatilsEntity();
    private endUserEntity = new endUserEntity();
    private authEntity = new AuthEntity();
    private nodeRedEntity = new NodeRedEntity();
    private botFlowEntity = new BotFlowEntity();
    private nodeRedLogsEntity = new NodeRedLogsEntity();
    private orchestrationAgentEntity = new OrchestrationAgentEntity();
    private agenticEntity = new AgenticEntity();
    private connectedUsers: Map<any, any> = new Map();
    private llmService = new LLMService("grok");


    constructor(private io: Server) { }

    public initializeSocket() {
        this.io.on("connection", (socket: Socket) => {
            console.log("User connected:", socket.id);
            socket.on("newuser", (userDetails: any) => this.handleNewUser(userDetails, socket));
            socket.on("sendMessageByUser", (chatMessage: any) => this.handleUserMessage(chatMessage, socket));
            socket.on("newUserJoined", (newUserDetails: any) => this.handleNewUserJoined(newUserDetails, socket));
            socket.on("sendMessageByAdmin", (adminMessage: any) => this.handleAdminMessage(adminMessage, socket));
            socket.on("disconnect", () => this.handleDisconnect(socket));
        });
    }

    private handleNewUser(userDetails: any, socket: Socket) {
        this.connectedUsers.set(userDetails.dbid, socket);
        console.log(`User ${userDetails.dbid} connected`);
    }

    private async handleUserMessage(chatMessage: any, socket: Socket) {
        try {

            let isMessageSentToBot = true;
            let isSendToNodeRed = true;
            let sendToReactAgent = true;
            let botId = "";

            const receiverDetails = await this.accountDetailsService.getCompanyDetailsById(chatMessage.receiver);
            if (receiverDetails) {
                isMessageSentToBot = receiverDetails?.sendToBot;
                isSendToNodeRed = receiverDetails?.sendToNodeRed;
                sendToReactAgent = receiverDetails?.sendToReactAgent;
                botId = receiverDetails?.botId ?? "";

            } else {
                const senderDetails = await this.accountDetailsService.getCompanyDetailsById(chatMessage.sender);
                if (senderDetails) {
                    isMessageSentToBot = senderDetails?.sendToBot;
                    isSendToNodeRed = senderDetails?.sendToNodeRed;
                    sendToReactAgent = senderDetails?.sendToReactAgent;
                    botId = senderDetails?.botId ?? "";
                }
            }

            console.log(this.confirmationAwaiting)
            if (this.confirmationAwaiting.has(socket.id)) {
                console.log(`[Socket] Received confirmation response from user ${socket.id}: "${chatMessage.message}"`);
                console.log("chat message" + JSON.stringify(chatMessage))
                if (sendToReactAgent) {
                    console.log("[Decision] Routing to ReAct Agent.");
                    const decision = await this.orchestrationAgentEntity.decideFlowChartsForReactAgent({ message: chatMessage.message });
                    console.log("orchestration agent response for the react agent " + decision)
                    if (decision === "FAQ") {
                        const { prompt } = await this.botEntity.getBotDefination({ botId }, { prompt: 1 });
                        const refinementPrompt = `${prompt}. Below is the list of answers comma separated and a question asked by user. Reply to the user by selecting the relevant answer and refining the answer. Don't reply with the question, just reply with the refined answer. Question: ${chatMessage.message}`;
                        const aiResponse = await this.llmService.callGrok(refinementPrompt, [], chatMessage.message, "grok-3-mini-fast");
                        socket.emit("receiveMessageToUser", {
                            message: aiResponse,
                            sender: chatMessage.receiver,
                            receiver: chatMessage.sender,
                        });
                        return;
                    }
                }
                this.confirmationAwaiting.get(socket.id)?.(chatMessage.message);
                this.confirmationAwaiting.delete(socket.id);
                return;
            }


            const findBot = await this.botEntity.getBotDefination({ botId });
            const companyId = findBot?.companyId;
            let findUser = await UserModel.findOne({ companyId })
            let userId = findUser?._id as string;
            let accountId = await accountDeatils.findOne({ companyId, type: ACCOUNT_TYPE.LIVE_CHAT });
            let accountIdValue = accountId?._id as string;
            await saveMessage(chatMessage.message, chatMessage.sender, chatMessage.receiver, companyId, ACCOUNT_TYPE.LIVE_CHAT);
            if (!companyId) {
                console.error("Error in handleUserMessage: Company ID could not be determined.");
                socket.emit("receiveMessageToUser", { message: "Error: Could not process request. System is not configured properly.", sender: chatMessage.receiver, receiver: chatMessage.sender });
                return;
            }
            console.log(sendToReactAgent, isMessageSentToBot, isSendToNodeRed)

            if (sendToReactAgent) {
                console.log("[Decision] Routing to ReAct Agent.");
                const decision = await this.orchestrationAgentEntity.decideFlowChartsForReactAgent({ message: chatMessage.message });
                console.log("orchestration agent response for the react agent " + decision)
                if (decision === "FAQ") {
                    const { prompt } = await this.botEntity.getBotDefination({ botId }, { prompt: 1 });
                    const refinementPrompt = `${prompt}. Below is the list of answers comma separated and a question asked by user. Reply to the user by selecting the relevant answer and refining the answer. Don't reply with the question, just reply with the refined answer. Question: ${chatMessage.message}`;
                    const aiResponse = await this.llmService.callGrok(refinementPrompt, [], chatMessage.message, "grok-3-mini-fast");
                    socket.emit("receiveMessageToUser", {
                        message: aiResponse,
                        sender: chatMessage.receiver,
                        receiver: chatMessage.sender,
                    });

                } else {
                    await this.runReActAgent(chatMessage, socket, companyId, botId);
                }
                return;
            }

            if (isSendToNodeRed) {
                const botFlow = await this.botFlowEntity.getBotFlow(botId, "ONE")
                const flowData = botFlow;
                if (flowData) {

                    const newMsg = {
                        content: chatMessage.message,
                        role: "user"
                    };

                    const decision = await this.orchestrationAgentEntity.decideFlowForChats(botId, chatMessage.sender, chatMessage.message)
                    console.log("decision" + decision)

                    // Step 1: Find existing running BotState
                    let botState = await BotState.findOne({
                        botId,
                        endUserId: chatMessage.sender,
                        status: 'RUNNING',
                        flowId: decision
                    }).sort({ created: -1 });

                    // Step 2: If found, update messages
                    if (botState) {
                        const exists = botState.messages.some(
                            msg => msg.content === newMsg.content && msg.role === newMsg.role
                        );

                        if (!exists) {
                            if (botState.messages.length >= 20) {
                                botState.messages.shift(); // remove oldest message
                            }

                            botState.messages.push(newMsg);
                            await botState.save();
                        }
                    } else {
                        // Step 3: Create new BotState
                        botState = new BotState({
                            endUserId: chatMessage.sender,
                            botState: [], // initially empty, fill when needed
                            accountId: accountIdValue,
                            botId: botId,
                            companyId: companyId,
                            status: 'RUNNING',
                            variables: [],
                            created: new Date(),
                            messages: [newMsg],
                            flowId: decision
                        });

                        await botState.save();
                    }

                    let businessName = "";
                    if (decision === "685993a2f0d0b9527b9f0d41") {
                        businessName = "MY bussisness is in the github tools sector"
                    } else {
                        businessName = "MY bussisness is in the github tools sector"
                    }

                    let createFlow = await this.nodeRedEntity.loadFlowToNodeRED(botId, decision)
                    let payload = { currentChat: "i want to open bank account", businessName: businessName, endUserId: chatMessage.sender, companyId: companyId, accountId: accountIdValue, message: chatMessage.message }

                    // hum yeha check kar rhe hai ki jo flow hame orchestration agent se mil rha hai usme kya sirf ek hi agent hai agar haa to usi ko call karo phir:- 
                    let findFlow = await BotFlow.findOne({ _id: new mongoose.Types.ObjectId(decision) })
                    if (findFlow && findFlow.flow.length === 1) {
                        let response;
                        if (findFlow?.flow[0].agentName === "securityLayer") {
                            console.log("Signle Flow execution")
                            const data = { flowId: decision, companyId, message: chatMessage.message, endUserId: chatMessage.sender, userAgentName: findFlow?.flow[0].userAgentName, botId, businessName }
                            response = await this.agenticEntity.securityLayerAgent(data)
                        } else if (findFlow?.flow[0].agentName === "issueIdentifier") {
                            const data = { flowId: decision, companyId, message: chatMessage.message, endUserId: chatMessage.sender, userAgentName: findFlow?.flow[0].userAgentName, botId, businessName }
                            response = await this.agenticEntity.issueIdentifierAgent(data)
                        } else if (findFlow?.flow[0].agentName === "faqAgent") {
                            const data = { flowId: decision, companyId, message: chatMessage.message, endUserId: chatMessage.sender, userAgentName: findFlow?.flow[0].userAgentName, botId, businessName }
                            response = await this.agenticEntity.faqAgent(data)
                        }
                        socket.emit("receiveMessageToUser", {
                            message: response,
                            sender: chatMessage.receiver,
                            receiver: chatMessage.sender,
                        });

                        return;
                    }

                    await new Promise(res => setTimeout(res, 100));
                    let executeFlow = await this.nodeRedEntity.executeFlow(botId, payload, decision);
                    console.log("node red Flow execution")


                    socket.emit("receiveMessageToUser", {
                        message:
                            JSON.stringify(executeFlow?.data?.apiResponse?.response?.msg)
                                ? JSON.stringify(executeFlow?.data?.apiResponse?.response?.msg)
                                : JSON.stringify(executeFlow?.data?.apiResponse?.functionName)
                                    ? JSON.stringify(executeFlow?.data?.apiResponse?.functionName)
                                    : JSON.stringify(executeFlow?.data?.apiResponse)
                                        ? JSON.stringify(executeFlow?.data?.apiResponse)
                                        : "error occurred",
                        sender: chatMessage.receiver,
                        receiver: chatMessage.sender,
                    });
                }
            } else if (isMessageSentToBot) {
                let replyFrom = "BOT"
                const botResponse = await receiveMessageFromBot(chatMessage.message, botId, chatMessage.sender);
                const answerArray = botResponse?.data.map((item: any) => item.answer) || [];

                if (botResponse.success) {
                    const { prompt } = await this.botEntity.getBotDefination({ botId }, { prompt: 1 });
                    const refinementPrompt = `${prompt}. Below is the list of answers comma separated and a question asked by user. Reply to the user by selecting the relevant answer and refining the answer. Don't reply with the question, just reply with the refined answer. Question: ${chatMessage.message} Answers: ${answerArray.join(", ")}`;
                    const refinedAnswer = await this.kritrimService.testKrutrimAPI([], refinementPrompt, findBot?.faqModel);

                    try {
                        // const parsedResponse = JSON.parse(kritrimResponse);
                        // const refinedAnswer = parsedResponse.topic;

                        const logId = botResponse?.logger_id;
                        if (logId) this.logService.addStepAndComplete(logId, refinementPrompt, refinedAnswer);
                        await saveMessage(refinedAnswer, chatMessage.receiver, chatMessage.sender, companyId, ACCOUNT_TYPE.LIVE_CHAT, replyFrom, botId);
                        socket.emit("receiveMessageToUser", {
                            message: refinedAnswer,
                            sender: chatMessage.receiver,
                            receiver: chatMessage.sender,
                        });
                    } catch (error) {
                        console.error("Error parsing Kritrim API response:", error, "Response:", refinedAnswer);
                    }
                }
            }

            socket.broadcast.emit("receiveMessage", {
                message: chatMessage.message,
                sender: chatMessage.sender,
                receiver: chatMessage.receiver,
            });

        } catch (error: any) {
            console.error("Error in handleUserMessage:", error.message);
        }
    }

    private async runReActAgent(chatMessage: any, socket: Socket, companyId: string, botId: string) {
        try {
            console.log("react agent started");

            let agent = this.agentInstances.get(companyId);
            let toolExecutor = this.executorInstances.get(companyId);

            if (!agent || !toolExecutor) {
                console.log(`[ReAct] Initializing new Agent and Executor for Company ID: ${companyId}`);
                socket.emit('receiveMessageToUser', { message: "Initializing agent...", sender: chatMessage.receiver, receiver: chatMessage.sender });
                agent = await ReActAgent.create(companyId);
                toolExecutor = await ToolExecutor.create(companyId);
                this.agentInstances.set(companyId, agent);
                this.executorInstances.set(companyId, toolExecutor);
                socket.emit('receiveMessageToUser', { message: "Agent Is Ready", sender: chatMessage.receiver, receiver: chatMessage.sender });
            }

            const askUser = (question: string): Promise<string> => {
                return new Promise(async (resolve) => {
                    await saveMessage(question, chatMessage.receiver, chatMessage.sender, companyId, ACCOUNT_TYPE.LIVE_CHAT, "BOT", botId);
                    socket.emit('receiveMessageToUser', { message: question, sender: chatMessage.receiver, receiver: chatMessage.sender });
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
                status: 'RUNNING',
                logType:"REACT_AGENT",
                steps: [{
                    stepNumber: 1,
                    type: 'QUERY',
                    content: `User initiated with query: "${chatMessage.message}"`,
                    timestamp: new Date()
                }]
            });
            await agentLog.save();

            // <<< HINDI COMMENT: `agent.run` को कॉल करते समय, मैंने `chatMessage.sender` और `chatMessage.receiver` को जोड़ा है।
            await agent.run(
                chatMessage.message,
                toolExecutor,
                socket,
                askUser,
                companyId,
                botId,
                endUserId,
                sessionId,
                chatMessage.sender,   // <<< बदलाव: receiverId जोड़ा गया
                chatMessage.receiver  // <<< बदलाव: senderId जोड़ा गया
            );

        } catch (error: any) {
            console.error("[ReAct] A critical error occurred in the agent flow:", error);
            socket.emit('receiveMessageToUser', { message: `An unexpected error occurred: ${error.message}`, sender: chatMessage.receiver, receiver: chatMessage.sender });
        }
    }

    private handleNewUserJoined(newUserDetails: any, socket: Socket) {
        console.log("New user joined", newUserDetails.newUser);
        socket.broadcast.emit("receiveNewUserJoined", { newUser: newUserDetails.newUser });
    }

    private async handleAdminMessage(adminMessage: any, socket: Socket) {
        console.log("Admin message received:", adminMessage);
        let userType = await this.endUserEntity.findSingleendUser({ userId: adminMessage.receiver });
        let type = userType?.type as string;
        let companyId = userType?.companyId as string;
        let replyFrom = "USER";
        let findUser = await UserModel.findOne({ companyId });
        let userId = findUser?._id as string;

        if (type === ACCOUNT_TYPE.WHatSAPP) {
            let findAccountDetails;
            if (!Array.isArray(userType) && userType?.companyId) {
                findAccountDetails = await this.accountDetailsService.findAccountDetails({ companyId: userType.companyId, type: ACCOUNT_TYPE.WHatSAPP });
            }
            console.log(findAccountDetails);
            let phone_number_id = findAccountDetails?.phone_number_id as string;
            let accessToken = findAccountDetails?.accessToken as string;
            await saveMessage(adminMessage.message, adminMessage.sender, adminMessage.receiver, companyId, ACCOUNT_TYPE.WHatSAPP, replyFrom, adminMessage.userId);
            await sendWhatsAppMessage(adminMessage.receiver, adminMessage.message, phone_number_id, accessToken);
        } else {
            await saveMessage(adminMessage.message, adminMessage.sender, adminMessage.receiver, companyId, ACCOUNT_TYPE.LIVE_CHAT, replyFrom, adminMessage.userId);
            socket.broadcast.emit("receiveMessageToUser", {
                message: adminMessage.message,
                sender: adminMessage.sender,
                receiver: adminMessage.receiver,
            });
        }
    }

    private handleDisconnect(socket: Socket) {
        this.connectedUsers.forEach((value, key) => {
            if (value.id === socket.id) {
                this.connectedUsers.delete(key);
            }
        });
        console.log("User disconnected:", socket.id);
        this.confirmationAwaiting.delete(socket.id);
    }
}