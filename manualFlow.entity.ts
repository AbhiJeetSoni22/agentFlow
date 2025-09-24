// manualFlow.ts

import { nodeAgent } from "../services/flowService/nodeAgentService";
import { AgentFlow } from "../models/agentFlow";
import { AgentFlowState } from "../models/agentFlowState";
import { Log } from "../models/Log"; 
import {
  IAgentFlowState,
  IMesssage,
} from "../interfaces/executingFlow.interface";
import { Socket } from "socket.io";


export class ManualFlow {
  private flowId: string;
  private initialQuery: string;
  private userId: string;
  private agentId: string;
  private sessionId: string; 
  private accountId :string;
  private handleUserMessage: (
    chatMessage: any,
    socket: Socket
  ) => Promise<void>;
  constructor(
    flowId: string,
    initialQuery: string,
    userId: string,
    agentId: string,
    sessionId: string,
    handleUserMessage: (chatMessage: any, socket: Socket) => Promise<void>,
    accountId:string,
  ) {
    this.flowId = flowId;
    this.initialQuery = initialQuery;
    this.userId = userId;
    this.agentId = agentId;
    this.sessionId = sessionId;
    this.handleUserMessage = handleUserMessage;
    this.accountId=accountId
  }

  public async run(
    socket: Socket,
    confirmationAwaiting: Map<string, (response: string) => void>
  ) {
    try {
      
      const flowObject = await AgentFlow.findById(this.flowId);

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
        flowId: flowObject?.id,
        flowDescription: flowObject?.flowDescription,
        companyId: flowObject?.companyId,
        messages: [{ message: this.initialQuery, owner: "User" }],
        userId: this.userId,
        agentId: flowObject?.agentId,
        flowState: "start",
        nodes: [],
        variables: [],
      };

      const newExecutingFlow: IAgentFlowState =
        (await AgentFlowState.create(
          executingFlowData
        )) as unknown as IAgentFlowState;

      let currentNode = flow[0];
      let nextNodeId: string | number | undefined;
      let currentQuery = this.initialQuery;
      
      while (true) {
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
        
        // Ab yahan koi if condition nahi hai, sara logic nodeAgent se handle hoga
        nextNodeId = await nodeAgent(
          currentNode,
          currentQuery,
          newExecutingFlow,
          this.sessionId,
          this.initialQuery,
          this.agentId,
          this.userId,
          socket,
          confirmationAwaiting,
          this.accountId,
          this.flowId
        );
       
       if (nextNodeId === "PROMPT_REQUIRED") {
    const updatedFlow = await AgentFlowState.findById(newExecutingFlow._id);

    if (updatedFlow && updatedFlow.messages?.length > 0) {
        const userPrompt = updatedFlow.messages[updatedFlow.messages.length - 1].message;

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
            sender: this.accountId,
            receiver: this.userId,
        });
        const newQuery = await new Promise<string>((resolve) => {

            confirmationAwaiting.set(socket.id, resolve);
        });
        const messageObject: IMesssage = {
            message: newQuery,
            owner: "User",
        };

        await AgentFlowState.findOneAndUpdate(
            { _id: newExecutingFlow._id },
            { $push: { messages: messageObject } },
            { new: true }
        );

        currentQuery = newQuery;
    } else {
        console.error("❌ Error: Prompt not found in database.");
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
}else if (typeof nextNodeId === "string") {
          const nextNode = flow.find(
            (node) => node.userAgentName === nextNodeId
          );

          if (nextNode) {
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
            await AgentFlowState.findOneAndUpdate(
              { _id: newExecutingFlow._id },
              { flowState: "completed" },
              { new: true }
            );

            return "Thankyou FlowEnded";
          }
        } else {
          await AgentFlowState.findOneAndUpdate(
            { _id: newExecutingFlow._id },
            { flowState: "completed" },
            { new: true }
          );
          console.log("✅ Workflow completed. Final output:", nextNodeId);
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