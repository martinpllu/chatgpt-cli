# chum

Give ChatGPT direct access to read and write your application's code

## Status

alpha/proof of concept

Currently this is only suitable for very small apps

## Quick Start

TODO - install from npm

- `git clone https://github.com/martinpllu/chum`
- `cd chum`
- `npm install`
- Add a file `.env` containing:

```env
OPENAI_API_KEY=your_api_key_here
```

- Start via `npx tsx src/index.ts --directory=/path/to/your/app`
- `chum` will start by sending the content of ALL FILES in the directory to chatgpt. 
- Prompt the CLI to make a code change, e.g. `Improve the README`
- chum will change the required file(s)

To get started with `chatgpt-cli`, follow these steps:

1. Install the package globally using npm:

```bash
npm install -g chatgpt-cli
```

2. Configure your OpenAI API key in a `.env` file:

```env
OPENAI_API_KEY=your_api_key_here
```

3. Navigate to the directory containing the code you want to work on.

4. Run the chatbot with the directory option:

```bash
chatgpt-cli --directory .
```

5. Interact with the chatbot in your terminal. Give it commands or ask for suggestions, and it will use the OpenAI API to assist you.

## License

This project is open source and available under the ISC License.