// index.ts
import dbConnect from "./db";
import { nodeAgent } from "./nodeAgent";
import dotenv from "dotenv";
import { BotFlow } from "../src/models";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { IExecutingBotFlow, IMesssage } from "./executingFlow.interface";
import readline from "readline";

dotenv.config();

// Command line interface setup
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

class ManualFlow {
  private flowId: string;
  private initialQuery: string;
  private userId: string;

  constructor(flowId: string, initialQuery: string, userId: string) {
    this.flowId = flowId;
    this.initialQuery = initialQuery;
    this.userId = userId;
  }

  public async run() {
    try {
      const uri = process.env.DB_URI as string;
      if (!uri) {
        console.log("uri not found ");
        return;
      }
      await dbConnect(uri);
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
            const newQuery = await new Promise<string>((resolve) => {
              rl.question(userPrompt + "\n", (answer) => {
                resolve(answer);
              });
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
            console.error("❌ Error: Next node not found with ID:", nextNodeId);
            break;
          }
        } else {
          console.log("✅ Workflow completed. Final output:", nextNodeId);
          break;
        }
      }
    } catch (error: any) {
      console.log("error in run method", error.message);
    } finally {
      rl.close();
    }
  }
}

// Instantiate and run the class
const flowId = "68b5987f3cb5ad2a4deb861f";
const initialQuery = "i want to sum 10 and 15";
const userId = "dummyUserId";

const manualFlow = new ManualFlow(flowId, initialQuery, userId);
manualFlow.run();
