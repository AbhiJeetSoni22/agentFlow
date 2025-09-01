import dbConnect from "./db";
import { nodeAgent } from "./nodeAgent";
import dotenv from "dotenv";
import { BotFlow } from "../src/models";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { IExecutingBotFlow, IMesssage } from "./executingFlow.interface";
// Command line se user input lene ke liye library.
import readline from "readline";

dotenv.config();

// Command line interface setup
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

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
    let nextNodeId: string | number | undefined;
    let currentQuery = initialQuery;

    while (true) {
      nextNodeId = await nodeAgent(currentNode, currentQuery, newExecutingFlow);
      console.log("Current Agent:", currentNode.displayAgentName);
      console.log("Execution nextNodeId:", nextNodeId);

      if (nextNodeId === "PROMPT_REQUIRED") {
        // Database se latest document fetch karein
        const updatedFlow = await ExecutingBotFlow.findById(
          newExecutingFlow._id
        );
        if (updatedFlow && updatedFlow.messages.length > 0) {
          // Latest message ko prompt ke roop mein use karein
          const userPrompt =
            updatedFlow.messages[updatedFlow.messages.length - 1].message;
          const newQuery = await new Promise<string>((resolve) => {
            rl.question(userPrompt + "\n", (answer) => {
              resolve(answer);
            });
          }); // Ab naye answer ko messages array mein push karein
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
        continue; // Agle iteration par jaate hain
      } else if (typeof nextNodeId === "string") {
        const nextNode = flow.find((node) => node.userAgentName === nextNodeId);
        if (nextNode) {
          console.log(
            "➡️ Transitioning to next node:",
            nextNode.displayAgentName
          );
          currentNode = nextNode;
          currentQuery = ""; // New node ke liye query reset
        } else {
          console.error("❌ Error: Next node not found with ID:", nextNodeId);
          break;
        }
      } else {
        console.log("✅ Workflow completed. Final output:", nextNodeId);
        break; // Loop se bahar nikle
      }
    }
    rl.close();
  } catch (error: any) {
    console.log("error in main function", error.message);
  }
}

main("68a97ef9b953c4767e977052", "i want to sum", "dummyUserId");
