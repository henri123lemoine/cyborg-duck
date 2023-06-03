# Cyborg Duck

This is an Obsidian plugin built during AI Safety Camp #8 by the Cyborgism - Prompt libraries subproject. The plugin allows users to import a prompt library in order to conveniently use the prompts therein to improve their thinking/writing cyborg-style.

## Installation
Go in your .obsidian/plugins folder and run `git clone https://github.com/henri123lemoine/cyborg-duck`. A folder called `cyborg-duck` will be created. Run `cd cyborg-duck` and then `npm i`/`yarn install` to install the dependencies. You can now run `npm run dev`/`yarn dev` to start the plugin in development mode. After opening Obsidian and activating the plugin, you may also run `ctrl + shift + i` to open the developer tools and see the console output of the plugin for debugging purposes.

## Settings
For full experience, you need to set the following settings:
- `Prompt library path`: the path to the prompt library you want to use. The path is relative to the vault root, or absolute. The path should point to a JSON file. We will soon remove this setting and import the up-to-date prompt library from our Notion database. (see TODO)
- `Context amount`: the amount of context to feed the prompts with. The options are to give the whole note, the last 3 paragraphs, the last 3 sentences, or the last sentence; note that if some text from a note is selected when the user calls for a completion, the plugin will use the selected text as the context instead of the context amount.
- `Use pinecone`: whether or not to use an external dataset for prompts that are informed by knowledge from the Alignment Research Dataset (ARD). If you set this to true, you need to set the following settings:
  - `Pinecone API key`: the API key for the Alignment Research Dataset. DM @BionicD0LPH1N#5326 on Discord for access to the API key.
  - `Top K Results`: the maximum number of blocks that are used to inform the prompt. The higher this number, the more informed the prompts will be, but the slower and more expensive the plugin will be.
- `OpenAI API key`: your API key for the OpenAI API. DM @BionicD0LPH1N#5326 on Discord for access to an API key that has access to the GPT-4 model.
- `OpenAI Base Engine ID`: a bit of a misnomer, this setting is a dropdown that allows you to select the (not necessarily base) engine for the standard non-chat completions.
- `OpenAI Chat Engine ID`: this setting is a dropdown that allows you to select the engine for the chat completions.

## Prompt library format
The prompt library is a JSON file with the following format:
```json
[
    {
        "Name": "prompt name",
        "Prompt": "For normal completion models, this is a string. After the following excerpt, ask questions or whatnot.\n{context}",
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
The prompt library is a list of prompts. Prompts can have many more attributes than those that are shown here—'Description', 'Model name', 'Model type', etc—but these additional attributes are currently unused by the plugin.
Why are some prompts' `Prompt` simple strings, while others are lists of objects? For standard non-chat completion models, like `code-davinci-002` or `davinci`, the plugin will simply use the string as the prompt. For chat models, like `gpt-3.5-turbo` or `gpt-4`, the plugin will use the list of objects as the prompt.
How do prompts use the contents of the Obsidian notes the user is on? The plugin uses the following syntax:
- `{context}`: the plugin will replace this with the context from the current note as defined by the context amount.
- `{sources}`: the plugin will replace this with the sources found by embedding the current context and providing the top-k most semantically similar results from the Alignment Research Dataset. The dataset is currently not up-to-date, but will be updated in the following months.

## Usage
Once the plugin is installed and the settings are set, you can use the plugin by pressing the PromptSelect ribbon button, which will open a button for each valid prompt on the current note. Clicking on a button will generate the completion for the associated prompt from the prompt library. Additionally, you may go in the hotkey settings in order to define the hotkeys for valid prompts you may want to have access to more easily.

## TODO
See Github Issues.