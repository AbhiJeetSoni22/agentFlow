import dbConnect from "./db";
import {  nodeAgent } from "./nodeAgent";

import dotenv from 'dotenv'
import {BotFlow} from '../src/models'
dotenv.config()
// Run tests
async function main(flowId:string){
  try {
    const uri = process.env.DB_URI as string;
    if(!uri){
      console.log('uri not found')
    }
    await dbConnect(uri);
  const flowObject = await BotFlow.findById(flowId)
      let flow: any[] = flowObject?.flow ?? [];
    if (flow.length === 0) {
      console.log("⚠️ No nodes found in flow");
      return;
    }

let currentNode = flow[0];
let nextNodeId: string | number;


console.log('flow first node condition',flow[0].condition)
while (true) {

  nextNodeId = nodeAgent(currentNode);
  console.log("Current Agent:", currentNode.displayAgentName);
  console.log("Execution nextNodeId:", nextNodeId);

  if (typeof nextNodeId === "string") {
    console.log('type of node result is ',typeof nextNodeId)
    const nextNode = flow.find((node) => node.userAgentName === nextNodeId);
    if (nextNode) {
      console.log("➡️ Transitioning to next node:", nextNode.displayAgentName);
      currentNode = nextNode;
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
    console.log('error in main function',error.message)
  }
}

main('68a97ef9b953c4767e977052')
// const flow: FlowNode[] = [
//   {
//     agentName: "functionalAgent",
//     displayAgentName: "Sum",
//     userAgentName: "functionalAgent_31a934bd-9926-4b43-866e-93958d923fcb",
//     output: 2,
//     agentPrompt:
//       'please take parameters to the user not assign it from itself ok.\nFunction name: #{functionCall} \nRequired parameters: #{JSON.stringify(parameters)} \nAvailable variables: #{JSON.stringify(availableVariable)}\n\nInstructions:\n\n✅ Return only a single valid JSON object. Do NOT add anything outside it. \n❌ No code blocks (like ```json), \n❌ No plain text, \n❌ No explanation, \n❌ No extra logs or notes.\n\nIf all required parameters are available, return:\n\n{\n "functionName": "#{functionCall}",\n "parameters": [ \n { "param1": "value1" }, \n { "param2": "value2" }\n ],\n "availableVariable": [ \n { "variableName": "param1", "variableValue": "value1" }, \n { "variableName": "param2", "variableValue": "value2" }\n ]\n}\n\nIf any parameter is missing, return:\n\n{\n "response": {\n "msg": "Please provide param1, param2"\n },\n "availableVariable": [ \n { "variableName": "param3", "variableValue": "value3" } \n ]\n}\n\n⚠ Output must be raw valid JSON only. Nothing else. Just one clean object.\n',
//     agentModel: "Meta-Llama-3.1-70B-Instruct",
//     hardCodeFunction: null,
//     grabFunctionFrom: null,
//     availableFunctions: ["Sum"],
//     condition: [
//       {
//         isRunnable: true,
//         executeUserAgent:
//           "functionalAgent_774bdf97-cafe-47bb-8c99-1549a8be74e5",
//       },
//       {
//         isRunnable: false,
//         executeUserAgent:
//           "functionalAgent_c4274f9b-879c-4da3-8be3-3e01d998fd3f",
//       },
//     ],
//     _id: "68a1d5a404eefda5cede1886",
//   },
//   {
//     agentName: "functionalAgent",
//     displayAgentName: "Division ",
//     userAgentName: "functionalAgent_774bdf97-cafe-47bb-8c99-1549a8be74e5",
//     output: 1,
//     agentPrompt:
//       'please take parameters to the user not assign it from itself ok.\nFunction name: #{functionCall} \nRequired parameters: #{JSON.stringify(parameters)} \nAvailable variables: #{JSON.stringify(availableVariable)}\n\nInstructions:\n\n✅ Return only a single valid JSON object. Do NOT add anything outside it. \n❌ No code blocks (like ```json), \n❌ No plain text, \n❌ No explanation, \n❌ No extra logs or notes.\n\nIf all required parameters are available, return:\n\n{\n "functionName": "#{functionCall}",\n "parameters": [ \n { "param1": "value1" }, \n { "param2": "value2" }\n ],\n "availableVariable": [ \n { "variableName": "param1", "variableValue": "value1" }, \n { "variableName": "param2", "variableValue": "value2" }\n ]\n}\n\nIf any parameter is missing, return:\n\n{\n "response": {\n "msg": "Please provide param1, param2"\n },\n "availableVariable": [ \n { "variableName": "param3", "variableValue": "value3" } \n ]\n}\n\n⚠ Output must be raw valid JSON only. Nothing else. Just one clean object.\n',
//     agentModel: "Meta-Llama-3.1-70B-Instruct",
//     hardCodeFunction: null,
//     grabFunctionFrom: null,
//     availableFunctions: ["Division"],
//     condition: [], // No conditions, will return result directly
//     _id: "68a1d5a404eefda5cede1889",
//   },
//   {
//     agentName: "functionalAgent",
//     displayAgentName: "Multiplication",
//     userAgentName: "functionalAgent_c4274f9b-879c-4da3-8be3-3e01d998fd3f",
//     output: 1,
//     agentPrompt:
//       'please take parameters to the user not assign it from itself ok.\nFunction name: #{functionCall} \nRequired parameters: #{JSON.stringify(parameters)} \nAvailable variables: #{JSON.stringify(availableVariable)}\n\nInstructions:\n\n✅ Return only a single valid JSON object. Do NOT add anything outside it. \n❌ No code blocks (like ```json), \n❌ No plain text, \n❌ No explanation, \n❌ No extra logs or notes.\n\nIf all required parameters are available, return:\n\n{\n "functionName": "#{functionCall}",\n "parameters": [ \n { "param1": "value1" }, \n { "param2": "value2" }\n ],\n "availableVariable": [ \n { "variableName": "param1", "variableValue": "value1" }, \n { "variableName": "param2", "variableValue": "value2" }\n ]\n}\n\nIf any parameter is missing, return:\n\n{\n "response": {\n "msg": "Please provide param1, param2"\n },\n "availableVariable": [ \n { "variableName": "param3", "variableValue": "value3" } \n ]\n}\n\n⚠ Output must be raw valid JSON only. Nothing else. Just one clean object.\n',
//     agentModel: "Meta-Llama-3.1-70B-Instruct",
//     hardCodeFunction: null,
//     grabFunctionFrom: null,
//     availableFunctions: ["Multiply"],
//     condition: [], // No conditions, will return result directly
//     _id: "68a1d5a404eefda5cede188a",
//   },
// ];


