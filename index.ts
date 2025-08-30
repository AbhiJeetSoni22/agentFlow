import dbConnect from "./db";
import { nodeAgent } from "./nodeAgent";
import dotenv from "dotenv";
import { BotFlow } from "../src/models";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { IExecutingBotFlow } from "./executingFlow.interface";
import * as readline from "readline-sync";

dotenv.config();

// Run tests
async function main(flowId: string, initialQuery: string, userId: string) {
  try {
    const uri = process.env.DB_URI as string;
    if (!uri) {
      console.log("uri not found ");
      return;
    }
    await dbConnect(uri);
    const flowObject = await BotFlow.findById(flowId);
    let flow: any[] = flowObject?.flow ?? [];
    if (flow.length === 0) {
      console.log("No nodes found in flow");
      return;
    }

    const executingFlowData = {
      flowName: flowObject?.flowName,
      flowDescription: flowObject?.flowDescription,
      companyId: flowObject?.companyId,
      messages: [{ message: initialQuery, owner: "User" }],
      userId: userId,
      botId: flowObject?.botId,
      flowState: "start",
      nodes: [],
      variable: [],
    };

    const newExecutingFlow: IExecutingBotFlow = (await ExecutingBotFlow.create(
      executingFlowData
    )) as unknown as IExecutingBotFlow;
    console.log("✅ ExecutingBotFlow document created successfully!");
    console.log("New document ID:", newExecutingFlow._id);

    let currentNode = flow[0];
    let nextNodeId: string | number;
    let currentQuery = initialQuery;

    while (true) {
      nextNodeId = await nodeAgent(currentNode, currentQuery, newExecutingFlow);
      console.log("Current Agent:", currentNode.displayAgentName);
      console.log("Execution nextNodeId:", nextNodeId);

      if (typeof nextNodeId === "string") {
        const nextNode = flow.find((node) => node.userAgentName === nextNodeId);
        if (nextNode) {
          console.log(
            "➡️ Transitioning to next node:",
            nextNode.displayAgentName
          );
          currentNode = nextNode; // Yahan se agla input lein, agar zaroorat ho
          console.log(
            "Please provide the next query/parameters or type 'exit' to quit:"
          );
          currentQuery = readline.question("Your input: ");
          if (currentQuery.toLowerCase() === "exit") {
            break;
          }
        } else {
          console.error("❌ Error: Next node not found with ID:", nextNodeId);
          break;
        }
      } else {
        console.log("✅ Workflow completed. Final output:", nextNodeId);
        break; // Exit the loop
      }
    }
  } catch (error: any) {
    console.log("error in main function", error.message);
  }
}

main("68a97ef9b953c4767e977052", "i want to sum 10 and 20", "dummyUserId");
