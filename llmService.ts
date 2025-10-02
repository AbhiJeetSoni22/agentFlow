import { createXai } from "@ai-sdk/xai";
import { generateText } from "ai";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}
export class LLMService {
  private xaiProvider: ReturnType<typeof createXai>;

  public call: (
    modelPrompt: string,
    context: Message[],
    message: string,
    model?: string
  ) => Promise<string> = async () => {
    throw new Error("Model not initialized properly");
  };
  //creating constructor
  constructor(model: string = "grok") {
    this.xaiProvider = createXai({
      apiKey: process.env.GROK_API_KEY,
    });

    if (model.toLowerCase() === "grok") {
      this.call = this.callGrok;
    } else {
      throw new Error(
        `Model "${model}"  is not supported. Only 'grok' is available.`
      );
    }
  }

  public async callGrok(
    modelPrompt: string,
    context: Message[],
    message: string,
    model: string = "grok-3-mini"
  ): Promise<string> {
    const messages: Message[] = [
      { role: "system", content: modelPrompt },
      ...context,
      { role: "user", content: message },
    ];

    try {
      const { text } = await generateText({
        model: this.xaiProvider(model),
        messages: messages,
      });

      if (typeof text === "string") {
        return text.trim();
      } else {
        throw new Error("Invalid content type returned from Grok API ");
      }
    } catch (err: any) {
      console.error("Grok API error :", err.message);
      throw new Error(`Grok failed: ${err.message}`);
    }
  }
}
