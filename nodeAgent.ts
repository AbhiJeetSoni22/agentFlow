// functionalAgent.ts

import { toolExecutor } from "./toolExecutor";
import { Tools } from "./tools";
import { Condition, FlowNode } from "./types";

const prompt = require("prompt-sync")();
const conditions: Condition[] = [
  {
    "executeUserAgent": "functionalAgent_74bccf24-bb4b-427e-8514-10437bdeabe5",
    "isRunnable": true
  },
  {
    "executeUserAgent": "functionalAgent_a063c97f-81c7-4b6e-878f-478a2eb6f464",
    "isRunnable": false
  }
]
// Agent Class
class Agent {
  private node: FlowNode;
  private param1: number; // No longer optional, will always be provided
  private param2: number; // No longer optional, will always be provided

  // Constructor now expects parameters to be provided
  constructor(node: FlowNode, param1: number, param2: number) {
    this.node = node;
    this.param1 = param1;
    this.param2 = param2;
  }

  run(): string | number {
    let result: number;
    const functionName = this.node.availableFunctions[0];

    try {
      // Pass the determined parameters to the toolExecutor
      result = toolExecutor(functionName, this.param1, this.param2);
      console.log(`✅ ${functionName} Result with (${this.param1}, ${this.param2}):`, result);

      // Determine the next step based on the result (e.g., if result > 50)
      const runnable = result > 50;
  
      if(functionName === 'Sum'){
       console.log('in working branch')
       console.log('writing something in main code with commit ')
        for (const condition of conditions) {
          if (condition.isRunnable === runnable) {
            return condition.executeUserAgent;
          }
        }
      }

      return result; // If no condition met, return the numerical result
    } catch (error) {
      console.error("❌ Error during execution:", error);
      // Return an appropriate error string or handle more robustly
      return "Error";
    }
  }
}

export function nodeAgent(
  node: FlowNode,
  param1?: number,
  param2?: number
): string | number {
  let finalParam1: number;
  let finalParam2: number;

  // Check if parameters were provided to this function call
  if (param1 !== undefined && param2 !== undefined) {
    finalParam1 = param1;
    finalParam2 = param2;
    console.log(`Parameters provided to runFunctionalAgent: ${finalParam1}, ${finalParam2}`);
  } else {
    // If parameters are not provided, prompt the user
    console.log(`\nAgent: ${node.displayAgentName}`); // Display agent name before prompting
    const inputA = prompt("Please enter the first parameter (a): ");
    const inputB = prompt("Please enter the second parameter (b): ");

    finalParam1 = parseFloat(inputA);
    finalParam2 = parseFloat(inputB);

    if (isNaN(finalParam1) || isNaN(finalParam2)) {
      console.warn("Invalid input received. Using default values (0, 0) for calculation.");
      finalParam1 = 0;
      finalParam2 = 0;
    }
    console.log(`Parameters obtained via prompt: ${finalParam1}, ${finalParam2}`);
  }

  try {
    // Pass the determined parameters to the Agent constructor
    const myAgent = new Agent(node, finalParam1, finalParam2);
    return myAgent.run();
  } catch (error) {
    if (error instanceof Error) {
      console.error("❌ Error in runFunctionalAgent:", error.message);
    }
    return "Error"; // Handle errors from agent construction or initial run
  }
}
