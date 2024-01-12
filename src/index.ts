import * as dotenv from "dotenv";
import { existsSync, writeFileSync } from "fs";
import { readdir, readFile } from "fs/promises";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import ora from "ora";
import path from "path";
import promptSync from "prompt-sync";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

const prompt = promptSync({ sigint: true });
dotenv.config();

const options = yargs(hideBin(process.argv))
    .options({
        directory: {
            alias: ["d", "dir"],
            type: "string",
            describe: `The directory containing the code`,
        },
        ignorePaths: {
            type: "array",
            describe: "Paths to ignore",
            default: [],
        },
    })
    .demandOption(["directory"])
    .parseSync();

const dir = options.directory as string;
const ignorePaths = (options.ignorePaths as string[]) || [];
if (!dir) {
    console.error(`Please specify a directory`);
    process.exit(1);
}
if (!existsSync(dir)) {
    console.error(`Directory ${dir} does not exist`);
    process.exit(1);
}
const absoluteDir = path.resolve(dir);

const DEFAULT_IGNORE_PATHS = [
    `\\.git`,
    `\\.idea`,
    `\\.vscode`,
    `\\.DS_Store`,
    `\\.env*`,
    `dist`,
    `build`,
    `out`,
    `node_modules`,
    `pnpm-lock\\.yaml`,
    `package-lock\\.json`,
    `\\.(jpg|jpeg|png|gif|ico)$`,
];

const catFilesSpec = {
    name: catFiles.name,
    description:
        "cat the contents of all files in the directory, exluding node_modules and other files that are not source code",
    parameters: {},
};
async function catFiles() {
    console.log(`Reading contents of directory ${absoluteDir}...`);
    const allIgnorePaths = [...DEFAULT_IGNORE_PATHS, ...ignorePaths];
    const files = await getFilesRecursive(absoluteDir, allIgnorePaths);
    let combinedContent = "";
    for (const file of files) {
        combinedContent += (await readFile(file, "utf8")) + "\n";
    }
    return combinedContent;
}

async function getFilesRecursive(
    dir: string,
    ignorePatterns: string[]
): Promise<string[]> {
    let results: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.resolve(dir, entry.name);
        if (entry.isDirectory()) {
            results = [
                ...results,
                ...(await getFilesRecursive(fullPath, ignorePatterns)),
            ];
        } else if (!isIgnored(fullPath, ignorePatterns)) {
            results.push(fullPath);
        }
    }
    return results;
}

function isIgnored(filePath: string, ignorePatterns: string[]) {
    return ignorePatterns.some((pattern) => new RegExp(pattern).test(filePath));
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
    console.log();
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
