import * as dotenv from "dotenv";
import * as readline from "readline";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"] as string,
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

let conversationHistory: ChatCompletionMessageParam[] = [
    { role: "system", content: "Talk like a pirate" },
];

const getResponse = async (prompt: string): Promise<string | null> => {
    conversationHistory.push({ role: "user", content: prompt });
    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: conversationHistory,
    });
    const responseMessage = response.choices[0].message.content;
    conversationHistory.push({ role: "assistant", content: responseMessage });
    return responseMessage;
};

const chat = async (): Promise<void> => {
    rl.question("You: ", async (userInput: string) => {
        const response = await getResponse(userInput);
        console.log("ChatGPT:", response);
        chat();
    });
};

console.log("AI Chat started. Type something to begin the conversation.");
chat();
