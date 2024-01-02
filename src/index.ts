import * as dotenv from "dotenv";
import * as readline from "readline";
import OpenAI from "openai";
import { readdirSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { ChatCompletionMessageParam } from "openai/resources";

const execAsync = promisify(exec);

async function catFilesInDirectory(path: string): Promise<string> {
    console.log(`JMP catting files...`);
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
    apiKey: process.env["OPENAI_API_KEY"], // This is the default and can be omitted
});

(async () => {
    const messages: ChatCompletionMessageParam[] = [
        {
            role: "user",
            // content:
            //     "Use catFilesInDirectory to get the contents of all files in /Users/martin/dev/reference-app",
            content:
                "Use catFilesInDirectory to get the contents of all files in /Users/martin/dev/chatgpt-cli",
        },
    ];
    while (true) {
        const response = await openai.chat.completions.create({
            messages,
            functions: [catFilesInDirectorySpec],
            model: "gpt-4",
        });
        console.log("ChatGPT:", JSON.stringify(response, undefined, 2));
        const responseMessage = response.choices[0].message;
        if (responseMessage.function_call?.name === catFilesInDirectory.name) {
            const args = JSON.parse(responseMessage.function_call.arguments);
            const path = args.path;
            const result = await catFilesInDirectory(path);
            messages.push({
                role: "function",
                name: "catFilesInDirectory",
                content: result,
            });
        }
    }
})();
