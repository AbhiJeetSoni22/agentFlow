

// Corrected import for the Grok/xAI provider
import { createXai } from '@ai-sdk/xai';
import { generateText } from 'ai';

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class LLMService {
    // The xAI/Grok provider instance
    private xaiProvider: ReturnType<typeof createXai>;

    // Method to be called based on model - with default implementation
    public call: (
        modelPrompt: string,
        context: Message[],
        message: string,
        model?: string
    ) => Promise<string> = async () => {
        throw new Error('Model not initialized properly');
    };

    constructor(model: string = 'grok') {
        // Validate API key
   

        // Initialize xAI provider
        this.xaiProvider = createXai({
                  apiKey: process.env.GROK_API_KEY,
        });
   
        // Set the appropriate call method based on model
        if (model.toLowerCase() === 'grok') {
            this.call = this.callGrok;
        } else {
            throw new Error(`Model "${model}" is not supported. Only 'grok' is available.`);
        }
    }

    /**
     * Calls the Grok API
     */
    public async callGrok(
        modelPrompt: string, 
        context: Message[], 
        message: string, 
        model: string = 'grok-3-mini'
    ): Promise<string> {
        const messages: Message[] = [
            { role: 'system', content: modelPrompt },
            ...context,
            { role: 'user', content: message },
        ];

        try {
            const { text } = await generateText({
                model: this.xaiProvider(model),
                messages: messages,
            });

            // Ensure text is a string before returning
            if (typeof text === 'string') {
                return text.trim();
            } else {
                // Handle cases where `text` might be something other than a string
                throw new Error('Invalid content type returned from Grok API');
            }
        } catch (err: any) {
            console.error('Grok API error:', err.message);
            throw new Error(`Grok failed: ${err.message}`);
        }
    }
}