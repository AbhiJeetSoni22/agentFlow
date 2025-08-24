import { Tools } from "./tools";

export function toolExecutor(functionName: string, a: number, b: number): number {
  switch (functionName) {
    case "Sum":
      return Tools.sum(a, b);
    case "Division":
      return Tools.division(a, b);
    case "Multiply":
      return Tools.multiply(a, b);
    default:
      throw new Error(`❌ Unknown function: ${functionName}`);
  }
}