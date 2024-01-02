
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import OpenAI from 'openai';
import { readdirSync } from 'fs';

dotenv.config();

const listDirectorySpec = {
    name: 'listDirectory',
    description: 'List the contents of a directory',
    parameters: {
        type: "object",
        properties: {
            path: {
                type: 'string',
                description: 'The path of the directory to list',
            }
        },
        required: ['path'],

    }
}

function listDirectory(path: string): string[] {
    return readdirSync(path);
}

const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
  });

  (async () => {
    const response = await openai.chat.completions.create({
        messages: [
            // { role: 'system', content: 'Give short answers' },
            { role: 'user', content: 'List the contents of /Users/martin/dev/' }],
            functions: [listDirectorySpec],
            model: "gpt-4",
        });
        console.log('ChatGPT:', JSON.stringify(response, undefined, 2));
        const responseMessage = response.choices[0].message;
        if (responseMessage.function_call?.name === 'listDirectory') {
            const args = JSON.parse(responseMessage.function_call.arguments);
            const path = args.path;
            const result = listDirectory(path);
            console.log('Directory listing', result);
        }
    })();
    
    // model: "gpt-3.5-turbo",
    
    // const rl = readline.createInterface({
        //   input: process.stdin,
//   output: process.stdout
// });




// async function askChatGPT(content: string) {
//     try {
//         const chatCompletion = await openai.chat.completions.create({
//             messages: [{ role: 'user', content }],
//             model: "gpt-3.5-turbo",
//           });
//       console.log('ChatGPT:', chatCompletion);
//     } catch (error) {
//       console.error('Error:', error);
//     }
//   }
    

// function chatLoop() {
//   rl.question('You: ', (input) => {
//     if (input.toLowerCase() === 'exit') {
//       rl.close();
//       return;
//     }
//     askChatGPT(input).then(() => chatLoop());
//   });
// }

// chatLoop();
