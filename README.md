# Cyborg Duck

Cyborg Duck is an innovative Obsidian plugin, developed during the AI Safety Camp #8 by the Cyborgism - Prompt Libraries subproject. The plugin enables users to import a library of prompts and use them to enhance their thinking and writing skills, cyborg-style. 

## Installation

To install, navigate to your `.obsidian/plugins` directory and execute the command `git clone https://github.com/henri123lemoine/cyborg-duck`. This command will create a folder named `cyborg-duck`. Then, move into the directory using the command `cd cyborg-duck`. Now, install the required dependencies by running `npm i` or `yarn install`. 

Once done, you can start the plugin in development mode by running `npm run dev` or `yarn dev`. To activate the plugin, open Obsidian, go to the Community settings, and enable Cyborg Duck. For debugging purposes, you can open the developer tools using `ctrl + shift + i` to view the console output of the plugin.

## Settings

To fully utilize the capabilities of this plugin, you need to configure the following settings:

- **Prompt library path:** This is the path to the JSON file that contains the prompt library. The path can be either absolute or relative to the vault root. In future releases, we aim to remove this setting and directly import the updated prompt library from our Notion database.

- **Context amount:** This setting determines the amount of context to feed the prompts with. Options include the whole note, the last 3 paragraphs, the last 3 sentences, or the last sentence. If any text from a note is selected when a completion is invoked, the plugin will use the selected text as the context instead.

- **Use Pinecone:** This setting determines whether to use an external dataset for prompts informed by the Alignment Research Dataset (ARD). If enabled, it requires the following additional settings:

  - **Pinecone API key:** This is the API key for accessing the Alignment Research Dataset. You can get access to the API key by DMing @BionicD0LPH1N#5326 on Discord.

  - **Top K Results:** This setting defines the maximum number of blocks used to inform the prompt. Higher values provide more informed prompts but may increase the plugin's latency and cost.

- **OpenAI API key:** This is your personal API key for the OpenAI API. You can get access to an API key with GPT-4 model permissions by DMing @BionicD0LPH1N#5326 on Discord.

- **OpenAI Base Engine ID:** Despite its name, this dropdown setting allows you to select any engine, not necessarily a base one, for the standard non-chat completions.

- **OpenAI Chat Engine ID:** This dropdown setting allows you to select the engine for the chat completions.

## Prompt Library Format

The prompt library is a JSON file formatted as follows:

```json
[
    {
        "Name": "prompt name",
        "Prompt": "this is a prompt that may use the following syntax: {context}",
    },
    {
        "Name": "informed prompt name #2",
        "Prompt": [
            {"role": "system", "content": "You are a informed chatbot...etc."},
            {"role": "user", "content": "Using the sources, note down errors in the context.\n\nSources: {sources}\n\nContext: {context}."}
        ]
    },
    ...
]
```

Each prompt library is a list of prompts, each having a 'Name' and a 'Prompt', with additional optional and currently unused attributes. The 'Prompt' could be a simple string or a list of objects, depending on whether it's designed for standard non-chat completion models (like `code-davinci-002` or `davinci`) or chat models (like `gpt-3.5-turbo` or `gpt-4`).

## Usage

Plugin showcase:
[![Watch the plugin showcase](https://imgur.com/TQvM6KT)](https://youtu.be/xoT7lXjKkOQ)

## TODO

See our Github Issues page.
