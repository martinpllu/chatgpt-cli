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

let conversationHistory: ChatCompletionMessageParam[] = [];

async function getResponse(prompt: ChatCompletionMessageParam, log = false) {
    if (log) console.log("You:", prompt.content);
    conversationHistory.push(prompt);
    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: conversationHistory,
    });
    const responseMessage = response.choices[0].message.content;
    conversationHistory.push({ role: "assistant", content: responseMessage });
    console.log("ChatGPT:", responseMessage);
}

const chat = async (): Promise<void> => {
    rl.question("You: ", async (userInput: string) => {
        await getResponse({
            role: "user",
            content: userInput,
        });
        chat();
    });
};

(async () => {
    await getResponse(
        {
            role: "system",
            content:
                "Don't respond to this prompt, but from now on always talk like a pirate",
        },
        true
    );
    await getResponse({ role: "user", content: "How are you today?" }, true);
    chat();
})();
