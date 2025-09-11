// index.ts

import { nodeAgent } from "../services/flowService/nodeAgentService";

import { BotFlow } from "../models";

import { ExecutingBotFlow } from "../models/executingFlow";

import {
  IExecutingBotFlow,
  IMesssage,
} from "../interfaces/executingFlow.interface";

import { Socket } from "socket.io";

export class ManualFlow {
  private flowId: string;

  private initialQuery: string;

  private userId: string;

  private botId: string;

  constructor(
    flowId: string,
    initialQuery: string,
    userId: string,
    botId: string
  ) {
    this.flowId = flowId;

    this.initialQuery = initialQuery;

    this.userId = userId;

    this.botId = botId; //
  }

  public async run(
    socket: Socket,
    confirmationAwaiting: Map<string, (response: string) => void>
  ) {
    try {
      const flowObject = await BotFlow.findById(this.flowId);

      const flow: any[] = flowObject?.flow ?? [];

      if (flow.length === 0) {
        console.log("No nodes found in flow");

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

      while (true) {
        nextNodeId = await nodeAgent(
          currentNode,
          currentQuery,
          newExecutingFlow
        );

        if (nextNodeId === "PROMPT_REQUIRED") {
          const updatedFlow = await ExecutingBotFlow.findById(
            newExecutingFlow._id
          );

          if (updatedFlow && updatedFlow.messages?.length > 0) {
            const userPrompt =
              updatedFlow.messages[updatedFlow.messages.length - 1].message;

            console.log("user id is ", this.userId);

            console.log("bot id is ", this.botId);

            console.log("message for the frontend", userPrompt); // Frontend ko message bhejo ki user se prompt chahiye

            socket.emit("receiveMessageToUser", {
              message: userPrompt,

              sender: this.botId,

              receiver: this.userId,
            }); // Wait for a response from the user

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

            break;
          }

          continue;
        } else if (typeof nextNodeId === "string") {
          const nextNode = flow.find(
            (node) => node.userAgentName === nextNodeId
          );

          if (nextNode) {
            currentNode = nextNode;

            currentQuery = "";
          } else {
            return "Thankyou FlowEnded";
          }
        } else {
          await ExecutingBotFlow.findOneAndUpdate(
            { _id: newExecutingFlow._id },

            { flowState: "completed" },

            { new: true }
          );

          console.log("✅ Workflow completed. Final output:", nextNodeId);

          return nextNodeId;
        }
      }
    } catch (error: any) {
      console.log("error in run method", error.message);
    }
  }
}
