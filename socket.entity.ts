// src/entities/socket.entity.ts

import { Server, Socket } from "socket.io";
import mongoose from "mongoose";
import { ReActAgent } from "../services/reactAgent";
import { ToolExecutor } from "../services/toolExecuter";
import { Log } from "../models";
import { v4 as uuidv4 } from "uuid";
import { LLMService } from "../services/llmService";

import { receiveMessageFromBot, saveMessage } from "../controllers";
import {
  AccountDeatilsEntity,
  Kritrim,
  LogEntity,
  BotEntity,
  endUserEntity,
  AuthEntity,
  NodeRedEntity,
  BotFlowEntity,
  NodeRedLogsEntity,
  OrchestrationAgentEntity,
  AgenticEntity,
} from "./index";
import { ACCOUNT_TYPE } from "../constants";
import { sendWhatsAppMessage } from "../services";
import { accountDeatils, UserModel, BotState, BotFlow } from "../models";
import { ManualFlow } from "./manualFlow.entity";

export class SocketEntity {
  private agentInstances: Map<string, ReActAgent> = new Map();
  private executorInstances: Map<string, ToolExecutor> = new Map();
  private confirmationAwaiting: Map<string, (response: string) => void> =
    new Map();
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
  private manualFlowInstances: Map<string, ManualFlow> = new Map();

  constructor(private io: Server) {}

  public initializeSocket() {
    this.io.on("connection", (socket: Socket) => {
      console.log("User connected:", socket.id);
      socket.on("newuser", (userDetails: any) =>
        this.handleNewUser(userDetails, socket)
      );
      socket.on("sendMessageByUser", (chatMessage: any) =>
        this.handleUserMessage(chatMessage, socket)
      );
      socket.on("newUserJoined", (newUserDetails: any) =>
        this.handleNewUserJoined(newUserDetails, socket)
      );
      socket.on("sendMessageByAdmin", (adminMessage: any) =>
        this.handleAdminMessage(adminMessage, socket)
      );
      socket.on("disconnect", () => this.handleDisconnect(socket));
    });
  }

  private handleNewUser(userDetails: any, socket: Socket) {
    this.connectedUsers.set(userDetails.dbid, socket);
    console.log(`User ${userDetails.dbid} connected`);
  }

  private async handleUserMessage(chatMessage: any, socket: Socket) {
    try {
      // Step 1: Initialize variables and get bot details
      let isMessageSentToBot = true;
      let isSendToNodeRed = true;
      let sendToReactAgent = true;
      let botId = "";

      // Get details based on the receiver or sender
      const agentDetails =
        (await this.accountDetailsService.getCompanyDetailsById(
          chatMessage.receiver
        )) ||
        (await this.accountDetailsService.getCompanyDetailsById(
          chatMessage.sender
        ));

      if (agentDetails) {
        isMessageSentToBot = agentDetails.sendToBot;
        isSendToNodeRed = agentDetails.sendToNodeRed;
        sendToReactAgent = agentDetails.sendToReactAgent;
        botId = agentDetails.botId ?? "";
      }

      // Step 2: Handle messages that are replies to a previous prompt
      if (this.confirmationAwaiting.has(socket.id)) {
        console.log(`[Socket] Received a response from an awaiting user.`);
        const resolver = this.confirmationAwaiting.get(socket.id);
        if (resolver) {
          resolver(chatMessage.message);
          this.confirmationAwaiting.delete(socket.id);
        }
        return;
      }

      // Step 3: Save the initial user message to the database
      const findBot = await this.botEntity.getBotDefination({ botId });
      const companyId = findBot?.companyId;

      await saveMessage(
        chatMessage.message,
        chatMessage.sender,
        chatMessage.receiver,
        companyId,
        ACCOUNT_TYPE.LIVE_CHAT
      );

      if (!companyId) {
        console.error(
          "Error in handleUserMessage: Company ID could not be determined."
        );
        socket.emit("receiveMessageToUser", {
          message:
            "Error: Could not process request. System is not configured properly.",
          sender: chatMessage.receiver,
          receiver: chatMessage.sender,
        });
        return;
      }

      console.log(
        `[Message Routing] sendToReactAgent: ${sendToReactAgent}, isMessageSentToBot: ${isMessageSentToBot}, isSendToNodeRed: ${isSendToNodeRed}`
      );

      // Step 4: Route the message based on configuration flags
      if (sendToReactAgent) {
        console.log("[Decision] Routing to ReAct Agent.");
        const decision =
          await this.orchestrationAgentEntity.decideFlowChartsForReactAgent({
            message: chatMessage.message,
          });

        if (decision === "FAQ") {
          const { prompt } = await this.botEntity.getBotDefination(
            { botId },
            { prompt: 1 }
          );
          const refinementPrompt = `${prompt}. Below is the list of answers comma separated and a question asked by user. ...`;
          const aiResponse = await this.llmService.callGrok(
            refinementPrompt,
            [],
            chatMessage.message,
            "grok-3-mini-fast"
          );

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
        // 💡 Yahan Node-Red ke liye logging logic add kiya gaya hai
        const endUserId = chatMessage.sender;
        const sessionId = uuidv4();
        const initialQuery = chatMessage.message;
       console.log('control here in issendtonodered')
        const nodeRedLog = new Log({
          companyId,
          botId,
          endUserId,
          sessionId,
          initialQuery,
          status: "IN_PROGRESS", // Kyunki Node-Red flow abhi shuru hoga
          logsType: "NODE_RED", // logsType ko 'NODE_RED' par set karein
        });
        await nodeRedLog.save();

        let manualFlow = this.manualFlowInstances.get(socket.id);
        if (!manualFlow) {
          const userId = chatMessage.sender;
          const botId = chatMessage.receiver;

          let account = await accountDeatils.findOne(
            { _id: botId },
            { companyId: 1, _id: 0 }
          );

          const flow = await BotFlow.findOne(
            { companyId: account?.companyId },
            { _id: 1 }
          ).skip(7);

          const flowId = flow?.id;
          if (!flowId) {
            throw new Error("Flow ID not configured for this bot.");
          }

          manualFlow = new ManualFlow(
            flowId,
            chatMessage.message,
            userId,
            botId,
            sessionId
          );
          this.manualFlowInstances.set(socket.id, manualFlow);
        }

        const result = await manualFlow.run(socket, this.confirmationAwaiting);
        
        if (typeof result === "string" || typeof result === "number") {
          // Log ko yahan update karein jab flow complete ho jaye
          await Log.findOneAndUpdate(
            { sessionId },
            {
              status: "COMPLETED",
              finalAnswer: result,
              $push: {
                steps: {
                  type: "FINAL_ANSWER",
                  content: result,
                  timestamp: new Date(),
                }
              }
            }
          );
          socket.emit("receiveMessageToUser", {
            message: `Final result: ${result}`,
            sender: chatMessage.receiver,
            receiver: chatMessage.sender,
          });
        } else {
          // Log ko yahan update karein jab flow completed ho but result na ho
          await Log.findOneAndUpdate(
            { sessionId },
            { status: "COMPLETED", finalAnswer: "Flow completed without a specific final result." }
          );
          socket.emit("receiveMessageToUser", {
            message: "Flow completed without a specific final result.",
            sender: chatMessage.receiver,
            receiver: chatMessage.sender,
          });
        }

        this.manualFlowInstances.delete(socket.id);
        return;
      }

      if (isMessageSentToBot) {
        let replyFrom = "BOT";
        const botResponse = await receiveMessageFromBot(
          chatMessage.message,
          botId,
          chatMessage.sender
        );
        const answerArray =
          botResponse?.data?.map((item: any) => item.answer) || [];

        if (botResponse.success) {
          const { prompt } = await this.botEntity.getBotDefination(
            { botId },
            { prompt: 1 }
          );
          const refinementPrompt = `${prompt}. Below is the list of answers...`;
          const refinedAnswer = await this.kritrimService.testKrutrimAPI(
            [],
            refinementPrompt,
            findBot?.faqModel
          );

          await saveMessage(
            refinedAnswer,
            chatMessage.receiver,
            chatMessage.sender,
            companyId,
            ACCOUNT_TYPE.LIVE_CHAT,
            replyFrom,
            botId
          );
          socket.emit("receiveMessageToUser", {
            message: refinedAnswer,
            sender: chatMessage.receiver,
            receiver: chatMessage.sender,
          });
        }
      }

      // Step 5: Broadcast the message to all other connected clients
      socket.broadcast.emit("receiveMessage", {
        message: chatMessage.message,
        sender: chatMessage.sender,
        receiver: chatMessage.receiver,
      });
    } catch (error: any) {
      console.error("Error in handleUserMessage:", error.message);
    }
  }

  private async runReActAgent(
    chatMessage: any,
    socket: Socket,
    companyId: string,
    botId: string
  ) {
    try {
      console.log("react agent started");

      let agent = this.agentInstances.get(companyId);
      let toolExecutor = this.executorInstances.get(companyId);

      if (!agent || !toolExecutor) {
        console.log(
          `[ReAct] Initializing new Agent and Executor for Company ID: ${companyId}`
        );
        socket.emit("receiveMessageToUser", {
          message: "Initializing agent...",
          sender: chatMessage.receiver,
          receiver: chatMessage.sender,
        });
        agent = await ReActAgent.create(companyId);
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
        chatMessage.sender, // <<< बदलाव: receiverId जोड़ा गया
        chatMessage.receiver // <<< बदलाव: senderId जोड़ा गया
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

  private handleNewUserJoined(newUserDetails: any, socket: Socket) {
    console.log("New user joined", newUserDetails.newUser);
    socket.broadcast.emit("receiveNewUserJoined", {
      newUser: newUserDetails.newUser,
    });
  }

  private async handleAdminMessage(adminMessage: any, socket: Socket) {
    console.log("Admin message received:", adminMessage);
    let userType = await this.endUserEntity.findSingleendUser({
      userId: adminMessage.receiver,
    });
    let type = userType?.type as string;
    let companyId = userType?.companyId as string;
    let replyFrom = "USER";
    let findUser = await UserModel.findOne({ companyId });
    let userId = findUser?._id as string;

    if (type === ACCOUNT_TYPE.WHatSAPP) {
      let findAccountDetails;
      if (!Array.isArray(userType) && userType?.companyId) {
        findAccountDetails =
          await this.accountDetailsService.findAccountDetails({
            companyId: userType.companyId,
            type: ACCOUNT_TYPE.WHatSAPP,
          });
      }
      console.log(findAccountDetails);
      let phone_number_id = findAccountDetails?.phone_number_id as string;
      let accessToken = findAccountDetails?.accessToken as string;
      await saveMessage(
        adminMessage.message,
        adminMessage.sender,
        adminMessage.receiver,
        companyId,
        ACCOUNT_TYPE.WHatSAPP,
        replyFrom,
        adminMessage.userId
      );
      await sendWhatsAppMessage(
        adminMessage.receiver,
        adminMessage.message,
        phone_number_id,
        accessToken
      );
    } else {
      await saveMessage(
        adminMessage.message,
        adminMessage.sender,
        adminMessage.receiver,
        companyId,
        ACCOUNT_TYPE.LIVE_CHAT,
        replyFrom,
        adminMessage.userId
      );
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

// const botFlow = await this.botFlowEntity.getBotFlow(botId, "ONE")
// const flowData = botFlow;
// if (flowData) {

//     const newMsg = {
//         content: chatMessage.message,
//         role: "user"
//     };

//     const decision = await this.orchestrationAgentEntity.decideFlowForChats(botId, chatMessage.sender, chatMessage.message)
//     console.log("decision" + decision)

//     // Step 1: Find existing running BotState
//     let botState = await BotState.findOne({
//         botId,
//         endUserId: chatMessage.sender,
//         status: 'RUNNING',
//         flowId: decision
//     }).sort({ created: -1 });

//     // Step 2: If found, update messages
//     if (botState) {
//         const exists = botState.messages.some(
//             msg => msg.content === newMsg.content && msg.role === newMsg.role
//         );

//         if (!exists) {
//             if (botState.messages.length >= 20) {
//                 botState.messages.shift(); // remove oldest message
//             }

//             botState.messages.push(newMsg);
//             await botState.save();
//         }
//     } else {
//         // Step 3: Create new BotState
//         botState = new BotState({
//             endUserId: chatMessage.sender,
//             botState: [], // initially empty, fill when needed
//             accountId: accountIdValue,
//             botId: botId,
//             companyId: companyId,
//             status: 'RUNNING',
//             variables: [],
//             created: new Date(),
//             messages: [newMsg],
//             flowId: decision
//         });

//         await botState.save();
//     }

//     let businessName = "";
//     if (decision === "685993a2f0d0b9527b9f0d41") {
//         businessName = "MY bussisness is in the github tools sector"
//     } else {
//         businessName = "MY bussisness is in the github tools sector"
//     }

//     let createFlow = await this.nodeRedEntity.loadFlowToNodeRED(botId, decision)
//     let payload = { currentChat: "i want to open bank account", businessName: businessName, endUserId: chatMessage.sender, companyId: companyId, accountId: accountIdValue, message: chatMessage.message }

//     // hum yeha check kar rhe hai ki jo flow hame orchestration agent se mil rha hai usme kya sirf ek hi agent hai agar haa to usi ko call karo phir:-
//     let findFlow = await BotFlow.findOne({ _id: new mongoose.Types.ObjectId(decision) })
//     if (findFlow && findFlow.flow.length === 1) {
//         let response;
//         if (findFlow?.flow[0].agentName === "securityLayer") {
//             console.log("Signle Flow execution")
//             const data = { flowId: decision, companyId, message: chatMessage.message, endUserId: chatMessage.sender, userAgentName: findFlow?.flow[0].userAgentName, botId, businessName }
//             response = await this.agenticEntity.securityLayerAgent(data)
//         } else if (findFlow?.flow[0].agentName === "issueIdentifier") {
//             const data = { flowId: decision, companyId, message: chatMessage.message, endUserId: chatMessage.sender, userAgentName: findFlow?.flow[0].userAgentName, botId, businessName }
//             response = await this.agenticEntity.issueIdentifierAgent(data)
//         } else if (findFlow?.flow[0].agentName === "faqAgent") {
//             const data = { flowId: decision, companyId, message: chatMessage.message, endUserId: chatMessage.sender, userAgentName: findFlow?.flow[0].userAgentName, botId, businessName }
//             response = await this.agenticEntity.faqAgent(data)
//         }
//         socket.emit("receiveMessageToUser", {
//             message: response,
//             sender: chatMessage.receiver,
//             receiver: chatMessage.sender,
//         });

//         return;
//     }

//     await new Promise(res => setTimeout(res, 100));
//     let executeFlow = await this.nodeRedEntity.executeFlow(botId, payload, decision);
//     console.log("node red Flow execution")

//     socket.emit("receiveMessageToUser", {
//         message:
//             JSON.stringify(executeFlow?.data?.apiResponse?.response?.msg)
//                 ? JSON.stringify(executeFlow?.data?.apiResponse?.response?.msg)
//                 : JSON.stringify(executeFlow?.data?.apiResponse?.functionName)
//                     ? JSON.stringify(executeFlow?.data?.apiResponse?.functionName)
//                     : JSON.stringify(executeFlow?.data?.apiResponse)
//                         ? JSON.stringify(executeFlow?.data?.apiResponse)
//                         : "error occurred",
//         sender: chatMessage.receiver,
//         receiver: chatMessage.sender,
//     });
// }
