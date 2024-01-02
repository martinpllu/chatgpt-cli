import * as dotenv from "dotenv";
import * as readline from "readline";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { exec } from "child_process";
import { promisify } from "util";

dotenv.config();
const execAsync = promisify(exec);

async function catFilesInDirectory(path: string): Promise<string> {
    const command = `find ${path} -type f -not -path '*/\\.*' -not -path '*/node_modules/*' -not -name 'pnpm-lock.yaml' -not -name 'package-lock.json' -not -name '*.jpg' -not -name '*.jpeg' -not -name '*.png' -not -name '*.gif' -not -name '*.ico' -exec echo {} \\; -exec cat {} \\;`;
    const { stdout } = await execAsync(command);
    return stdout;
}

dotenv.config();

const catFilesInDirectorySpec = {
    name: catFilesInDirectory.name,
    description:
        "cat the contents of all files in a directory, exluding node_modules and other files that are not source code",
    parameters: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "The path of the directory to cat files in",
            },
        },
        required: ["path"],
    },
};

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

    const response = await submitPrompt(prompt);
    const responseMessage = response.choices[0].message;
    if (responseMessage.function_call?.name === catFilesInDirectory.name) {
        const args = JSON.parse(responseMessage.function_call.arguments);
        const path = args.path;
        const result = await catFilesInDirectory(path);
        console.log("Sending file contents to ChatGPT...");
        await submitPrompt({
            role: "function",
            name: "catFilesInDirectory",
            content: result,
        });
        console.log("Complete!");
    } else {
        conversationHistory.push({
            role: "assistant",
            content: responseMessage.content,
        });
        console.log("ChatGPT:", responseMessage.content);
    }
}

async function submitPrompt(prompt: ChatCompletionMessageParam) {
    conversationHistory.push(prompt);
    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: conversationHistory,
        functions: [catFilesInDirectorySpec],
    });
    const totalTokens = response.usage?.total_tokens;
    console.log(`Used ${totalTokens} tokens`);
    return response;
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
            role: "user",
            content:
                "get the contents of all files in /Users/martin/dev/reference-app, then I'll ask you some questions about it",
        },
        true
    );
    chat();
})();
