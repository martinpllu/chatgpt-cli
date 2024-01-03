import * as dotenv from "dotenv";
import * as readline from "readline";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import ora from "ora";
dotenv.config();

const options = yargs(hideBin(process.argv))
    .options({
        directory: {
            alias: ["d", "dir"],
            type: "string",
            describe: `The directory containing the code`,
        },
    })
    .demandOption(["directory"])
    .parseSync();

const dir = options.directory as string;
if (!dir) {
    console.error(`Please specify a directory`);
    process.exit(1);
}
if (!existsSync(dir)) {
    console.error(`Directory ${dir} does not exist`);
    process.exit(1);
}

const catFilesInDirectorySpec = {
    name: catFilesInDirectory.name,
    description:
        "cat the contents of all files in the directory, exluding node_modules and other files that are not source code",
    parameters: {},
};
async function catFilesInDirectory(): Promise<string> {
    const execAsync = promisify(exec);
    const command = `find ${dir} -type f -not -path '*/\\.*' -not -path '*/node_modules/*' -not -name 'pnpm-lock.yaml' -not -name 'package-lock.json' -not -name '*.jpg' -not -name '*.jpeg' -not -name '*.png' -not -name '*.gif' -not -name '*.ico' -exec echo {} \\; -exec cat {} \\;`;
    const { stdout } = await execAsync(command);
    return stdout;
}

const writeToFileInDirectorySpec = {
    name: writeToFileInDirectory.name,
    description:
        "write the contents of a file inside the directory, creating the file if it does not exist",
    parameters: {
        type: "object",
        properties: {
            relativePath: {
                type: "string",
                description:
                    "The path of the file to write to, relative to the root of the directory",
            },
            contents: {
                type: "string",
                description: "The contents of the file",
            },
        },
        required: ["path", "contents"],
    },
};
function writeToFileInDirectory(relativePath: string, contents: string) {
    const fullPath = path.resolve(dir, relativePath);
    if (!fullPath.startsWith(path.resolve(dir))) {
        throw new Error("Path is outside the directory");
    }
    writeFileSync(fullPath, contents);
}

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
        const result = await catFilesInDirectory();
        console.log("Sending directory contents to ChatGPT...");
        await submitPrompt({
            role: "function",
            name: "catFilesInDirectory",
            content: result,
        });
        console.log("Complete!");
    } else if (
        responseMessage.function_call?.name === writeToFileInDirectory.name
    ) {
        const args = JSON.parse(responseMessage.function_call.arguments);
        writeToFileInDirectory(args.relativePath, args.contents);
        await submitPrompt({
            role: "function",
            name: "writeToFileInDirectory",
            content: "Done",
        });
        console.log(`Writing file ${args.relativePath}...`);
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
    const spinner = ora("ChatGPT").start();
    process.on("SIGINT", () => {
        spinner.stop();
        console.log("\nOperation interrupted by the user.");
        process.exit(1);
    });
    const response = await openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        messages: conversationHistory,
        functions: [catFilesInDirectorySpec, writeToFileInDirectorySpec],
    });
    spinner.stop();
    const totalTokens = response.usage?.total_tokens;
    console.log(`[${totalTokens} tokens]`);
    return response;
}

async function chat() {
    rl.question("You: ", async (userInput: string) => {
        await getResponse({
            role: "user",
            content: userInput,
        });
        chat();
    });
}

(async () => {
    await getResponse(
        {
            role: "user",
            content: `Get the contents of all files in the directory, then we'll start work`,
        },
        true
    );
    await getResponse(
        {
            role: "user",
            content: `Add an s3 bucket to the stack and give the function access to it`,
        },
        true
    );
    chat();
})();
