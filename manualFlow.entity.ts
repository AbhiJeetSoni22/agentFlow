// index.ts

import { nodeAgent } from "../services/flowService/nodeAgentService";
import { accountDeatils, BotFlow } from "../models";
import { ExecutingBotFlow } from "../models/executingFlow.schema";
import { Log } from "../models/Log"; // Log schema import karein
import {
  IExecutingBotFlow,
  IMesssage,
} from "../interfaces/executingFlow.interface";
import { Socket } from "socket.io";
import { ReactAgentService } from "../services/flowService/reactAgentService";

export class ManualFlow {
  private flowId: string;
  private initialQuery: string;
  private userId: string;
  private botId: string;
  private sessionId: string; // sessionId ko property ke roop mein add karein
  private handleUserMessage: (
    chatMessage: any,
    socket: Socket
  ) => Promise<void>;
  constructor(
    flowId: string,
    initialQuery: string,
    userId: string,
    botId: string,
    sessionId: string,
    handleUserMessage: (chatMessage: any, socket: Socket) => Promise<void> // Accept the new parameter
  ) {
    this.flowId = flowId;
    this.initialQuery = initialQuery;
    this.userId = userId;
    this.botId = botId;
    this.sessionId = sessionId;
    this.handleUserMessage = handleUserMessage; // Initialize the new property
  }

  public async run(
    socket: Socket,
    confirmationAwaiting: Map<string, (response: string) => void>
  ) {
    try {
      const flowObject = await BotFlow.findById(this.flowId);

      // Manual flow log update karein jab flow start ho
      await Log.findOneAndUpdate(
        { sessionId: this.sessionId },
        {
          status: "IN_PROGRESS",
          $push: {
            steps: {
              type: "FLOW_START",
              content: `Manual flow started for flowId: ${this.flowId}`,
              timestamp: new Date(),
            },
          },
        }
      );

      const flow: any[] = flowObject?.flow ?? [];

      if (flow.length === 0) {
        console.log("No nodes found in flow");
        // Log update karein ki flow empty hai
        await Log.findOneAndUpdate(
          { sessionId: this.sessionId },
          {
            status: "COMPLETED_WITH_ERROR",
            $push: {
              steps: {
                type: "FLOW_ERROR",
                content: `Flow has no nodes.`,
                timestamp: new Date(),
              },
            },
          }
        );
        return;
      }

      const executingFlowData = {
        flowName: flowObject?.flowName,
        flowDescription: flowObject?.flowDescription,
        companyId: flowObject?.companyId,
        messages: [{ message: this.initialQuery, owner: "User" }],
        userId: this.userId,
        botId: flowObject?.botId,
        flowState: "start",
        nodes: [],
        variables: [],
      };

      const newExecutingFlow: IExecutingBotFlow =
        (await ExecutingBotFlow.create(
          executingFlowData
        )) as unknown as IExecutingBotFlow;

      let currentNode = flow[0];
      let nextNodeId: string | number | undefined;
      let currentQuery = this.initialQuery;
      console.log('current query is ',currentQuery)
      while (true) {
        // Log update karein jab har node chal raha ho
        await Log.findOneAndUpdate(
          { sessionId: this.sessionId },
          {
            $push: {
              steps: {
                type: "NODE_EXECUTION",
                content: `Executing node: ${currentNode.userAgentName}`,
                timestamp: new Date(),
              },
            },
          }
        );
        console.log("starting manualflow file");
        // **Yahan naya check add karein**
if (currentNode.agentName === "reactAgent") {
    console.log('[Decision] Redirecting to ReAct Agent from Node-RED.');
    
    // Naya: Sabse latest executingFlow document fetch karein, sirf aakhri message ke saath
    const updatedFlow = await ExecutingBotFlow.findOne(
        { _id: newExecutingFlow._id },
        { messages: { $slice: -1 } } // Sirf aakhri element lo
    );
    
    let finalQuery = this.initialQuery;
    
    // Naya: Agar aakhri message user ka hai, to usse finalQuery set karein
    if (updatedFlow && updatedFlow.messages && updatedFlow.messages.length > 0) {
        const lastMessage = updatedFlow.messages[0];
        if (lastMessage.owner === "User") {
            finalQuery = lastMessage.message ?? this.initialQuery;
        }
    }
    
    console.log('Final query to be sent to ReAct Agent:', finalQuery);

    const reactAgentService = new ReactAgentService(confirmationAwaiting);
    const flowDoc = await BotFlow.findById(this.flowId);
    const companyId = flowDoc?.companyId;
    const hardCoadedFlowId = currentNode?.userAgentName;
    
    if (!companyId) {
        throw new Error("Company ID not found for the flow.");
    }
    
    // Naya: hardcoded query ko finalQuery se replace karein
    await reactAgentService.runReActAgent(
        { 
            message: finalQuery, 
            sender: this.userId, 
            receiver: this.botId 
        },
        socket,
        companyId,
        this.botId,
        hardCoadedFlowId
    );

    // Ab flow ko end kar dein
    return "nodered flow ended.";
}
        nextNodeId = await nodeAgent(
          currentNode,
          currentQuery,
          newExecutingFlow,
          this.sessionId
        );

        if (nextNodeId === "PROMPT_REQUIRED") {
          const updatedFlow = await ExecutingBotFlow.findById(
            newExecutingFlow._id
          );

          if (updatedFlow && updatedFlow.messages?.length > 0) {
            const userPrompt =
              updatedFlow.messages[updatedFlow.messages.length - 1].message;

            await Log.findOneAndUpdate(
              { sessionId: this.sessionId },
              {
                $push: {
                  steps: {
                    type: "USER_PROMPT_REQUIRED",
                    content: `User prompt required: ${userPrompt}`,
                    timestamp: new Date(),
                  },
                },
              }
            );

            socket.emit("receiveMessageToUser", {
              message: userPrompt,
              sender: this.botId,
              receiver: this.userId,
            });

            const newQuery = await new Promise<string>((resolve) => {
              confirmationAwaiting.set(socket.id, resolve);
            });

            const messageObject: IMesssage = {
              message: newQuery,
              owner: "User",
            };

            await ExecutingBotFlow.findOneAndUpdate(
              { _id: newExecutingFlow._id },
              { $push: { messages: messageObject } },
              { new: true }
            );

            currentQuery = newQuery;
          } else {
            console.error("❌ Error: Prompt not found in database.");
            // Log update karein jab error aaye
            await Log.findOneAndUpdate(
              { sessionId: this.sessionId },
              {
                status: "COMPLETED_WITH_ERROR",
                $push: {
                  steps: {
                    type: "FLOW_ERROR",
                    content: "Prompt not found in database.",
                    timestamp: new Date(),
                  },
                },
              }
            );
            break;
          }
          continue;
        } else if (typeof nextNodeId === "string") {
          const nextNode = flow.find(
            (node) => node.userAgentName === nextNodeId
          );

          if (nextNode) {
            // Log update karein jab next node mil jaye
            await Log.findOneAndUpdate(
              { sessionId: this.sessionId },
              {
                $push: {
                  steps: {
                    type: "NEXT_NODE_FOUND",
                    content: `Next node found: ${nextNodeId}`,
                    timestamp: new Date(),
                  },
                },
              }
            );
            currentNode = nextNode;
            currentQuery = "";
          } else {
            // Log update karein jab next node na mile
            await ExecutingBotFlow.findOneAndUpdate(
              { _id: newExecutingFlow._id },
              { flowState: "completed" },
              { new: true }
            );

            return "Thankyou FlowEnded";
          }
        } else {
          await ExecutingBotFlow.findOneAndUpdate(
            { _id: newExecutingFlow._id },
            { flowState: "completed" },
            { new: true }
          );

          console.log("✅ Workflow completed. Final output:", nextNodeId);

          // Log update karein jab flow successfuly complete ho
          await Log.findOneAndUpdate(
            { sessionId: this.sessionId },
            {
              status: "COMPLETED",
              finalAnswer: nextNodeId,
              $push: {
                steps: {
                  type: "FLOW_COMPLETED",
                  content: `Flow completed with final result: ${nextNodeId}`,
                  timestamp: new Date(),
                },
              },
            }
          );
          return nextNodeId;
        }
      }
    } catch (error: any) {
      console.log("error in run method", error.message);
      // Catch block mein bhi log update karein
      await Log.findOneAndUpdate(
        { sessionId: this.sessionId },
        {
          status: "COMPLETED_WITH_ERROR",
          $push: {
            steps: {
              type: "FLOW_ERROR",
              content: `Error in run method: ${error.message}`,
              timestamp: new Date(),
            },
          },
        }
      );
      return "Error";
    }
  }
}
