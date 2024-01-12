import * as dotenv from "dotenv";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, writeFileSync } from "fs";
import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import ora from "ora";
import promptSync from "prompt-sync";
const prompt = promptSync({ sigint: true });
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
const absoluteDir = path.resolve(dir);

const catFilesSpec = {
    name: catFiles.name,
    description:
        "cat the contents of all files in the directory, exluding node_modules and other files that are not source code",
    parameters: {},
};
async function catFiles(): Promise<string> {
    console.log(`Reading contents of directory ${absoluteDir}...`);
    const execAsync = promisify(exec);
    const command = `find ${absoluteDir} -type f -not -path '*/\\.*' -not -path '*/node_modules/*' -not -name 'pnpm-lock.yaml' -not -name 'package-lock.json' -not -name '*.jpg' -not -name '*.jpeg' -not -name '*.png' -not -name '*.gif' -not -name '*.ico' -exec echo {} \\; -exec cat {} \\;`;
    const { stdout } = await execAsync(command);
    return stdout;
}

const writeFilesSpec = {
    name: "writeFiles",
    description:
        "Write content to multiple files inside the directory, creating each file if it does not exist.",
    parameters: {
        type: "object",
        properties: {
            relativePaths: {
                type: "array",
                items: {
                    type: "string",
                    description:
                        "The paths of the files to write to, relative to the root of the directory",
                },
            },
            contentsArray: {
                type: "array",
                items: {
                    type: "string",
                    description: "The contents of the files",
                },
            },
        },
        required: ["relativePaths", "contentsArray"],
    },
};

function writeFiles(relativePaths: string[], contentsArray: string[]) {
    if (relativePaths.length !== contentsArray.length) {
        throw new Error("The number of paths and contents must be equal");
    }

    for (let i = 0; i < relativePaths.length; i++) {
        const fullPath = path.resolve(absoluteDir, relativePaths[i]);
        if (!fullPath.startsWith(absoluteDir)) {
            throw new Error(
                "One of the paths is outside the directory: " + fullPath
            );
        }
        writeFileSync(fullPath, contentsArray[i]);
    }
}

const openai = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"] as string,
});

let conversationHistory: ChatCompletionMessageParam[] = [];

async function getResponse(prompt: ChatCompletionMessageParam, log = false) {
    if (log) console.log("You:", prompt.content);
    const response = await submitPrompt(prompt);
    const responseMessage = response.choices[0].message;
    if (responseMessage.function_call?.name === catFiles.name) {
        const result = await catFiles();
        console.log("Sending directory contents to ChatGPT...");
        await submitPrompt({
            role: "function",
            name: "catFiles",
            content: result,
        });
        console.log("Complete!");
    } else if (responseMessage.function_call?.name === writeFiles.name) {
        const args = JSON.parse(responseMessage.function_call.arguments);
        writeFiles(args.relativePaths, args.contentsArray);
        await submitPrompt({
            role: "function",
            name: "writeFiles",
            content: "Done",
        });
        console.log(`Writing files ${args.relativePaths}...`);
    } else {
        conversationHistory.push({
            role: "assistant",
            content: responseMessage.content,
        });
    }
    if (responseMessage.content) {
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
        functions: [catFilesSpec, writeFilesSpec],
    });
    // spinner.stop();
    const totalTokens = response.usage?.total_tokens;
    console.log(`[${totalTokens} tokens]`);
    // console.log('JMP', JSON.stringify(response, null, 2));
    return response;
}

async function chat() {
    const content = prompt("You: ");
    await getResponse({
        role: "user",
        content,
    });
    await chat();
}

const systemPrompts = [
    `Start by reading the contents of all files in the directory.`,
    `Never output code changes to the console. Always write to files instead.`,
    `Always write the whole file contents, not just the changes.`,
];

(async () => {
    await getResponse(
        {
            role: "system",
            content: systemPrompts.join("\n"),
        },
        false
    );
    console.log(
        "ChatGPT: Let's get started! What would you like me to do to the code?"
    );
    await chat();
})();
