// main.ts

import * as fs from 'fs/promises';
import { App, MarkdownView, Plugin, Notice, TFile, TFolder, Editor, requestUrl, WorkspaceLeaf } from 'obsidian';

import { Configuration, OpenAIApi, ChatCompletionRequestMessage as Message } from "openai";

import { getEncoding } from "js-tiktoken";

import { DEFAULT_SETTINGS, CyborgDuckSettings, CyborgDuckSettingTab } from './SettingsHelper';
import { CommandManager } from './CommandManager';
import { Entry } from './LibraryHelper';
import { CyborgDuckView, CYBORG_DUCK_VIEW_TYPE } from "./CustomViews";
import { ReadableStreamDefaultReadResult } from 'web-streams-polyfill';


// INTERFACES
interface Block {
    title: string;
    author: string;
    date: string;
    url: string;
    tags: string;
    text: string;
    oldIndex: number;
}

interface Metadata {
    author: string;
    date: string;
    tags: string;
    text: string;
    title: string;
    url: string;
}

interface Match {
    id: string;
    metadata: Metadata;
    score: number;
    values: number[];
}

interface PineconeOutput {
    results: number[];
    matches: Match[];
    namespace: string;
}


// CONSTANTS
const TOKEN_LIMIT = 8191;
export const PINECONE_CONSTANTS = {
    URL: 'https://alignment-search-14c0337.svc.us-east1-gcp.pinecone.io/query',
    NAMESPACE: 'alignment-search'
};


// TYPES
type PromptData = string | Message[];

// Helper class to manage creation and actions of buttons
class ButtonManager {
    app: App;
    plugin: CyborgDuck;
    commandManager: CommandManager;

    constructor(app: App, plugin: CyborgDuck, commandManager: CommandManager) {
        this.app = app;
        this.plugin = plugin;
        this.commandManager = commandManager;
    }

    createButton(text: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.classList.add('cyborg-duck-button');
        button.textContent = text;
        button.addEventListener('click', onClick);
        return button;
    }
}


export default class CyborgDuck extends Plugin {
    settings: CyborgDuckSettings;
    openai: OpenAIApi;
    commandManager: CommandManager;
    buttonManager: ButtonManager;

    // Use a variable to track if buttons are displayed
    buttonsDisplayed: boolean = false;

    // CyborgDuckView Views
    cyborgDuckView: CyborgDuckView;

    // Upon loading the plugin
    async onload() {
        console.log('Loading Cyborg Duck plugin');

        await this.loadSettings();

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new CyborgDuckSettingTab(this.app, this));

        // Set up OpenAI API
        const configuration = new Configuration({
            apiKey: this.settings.openaiApiKey,
        });
        this.openai = new OpenAIApi(configuration);

        // Set up command and button managers
        this.commandManager = new CommandManager(this.app, this);
        this.buttonManager = new ButtonManager(this.app, this, this.commandManager);

        // Set up hotkeys
        await this.setUpHotkeys();

        // Register the view
        this.registerView(
            CYBORG_DUCK_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => (this.cyborgDuckView = new CyborgDuckView(leaf, this)),
        );
        
        this.addRibbonIcon('brain-circuit', 'PromptSelect', async () => {
            // Fetching Prompt Library
            const promptLibrary = await this.getPromptLibrary();

            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView) {
                if (this.buttonsDisplayed) {
                    this.removeAllButtons();
                    this.buttonsDisplayed = false;
                } else {
                    this.displayButtons(promptLibrary, markdownView);
                    this.buttonsDisplayed = true;
                }
            }

            // Open the right-side panels
            this.initLeaf();
        });
    }

    initLeaf() {
        // Check if the cyborg-duck-view is already open
        if (this.app.workspace.getLeavesOfType(CYBORG_DUCK_VIEW_TYPE).length) return;
        
        // Open the cyborg-duck-view in a new leaf on the right with the 'brain-circuit' icon
        this.app.workspace.getRightLeaf(false).setViewState({
            type: CYBORG_DUCK_VIEW_TYPE,
            active: true,
        });
    }
    
    openCustomView() {
        let leaf = this.app.workspace.activeLeaf;
        if (leaf) {
            leaf.setViewState({
                type: CYBORG_DUCK_VIEW_TYPE,
            });
        }
    }
    
    // Clean up any created elements upon plugin unload
    onunload() {
        this.removeAllButtons();

        this.app.workspace.detachLeavesOfType('PromptView');
        this.app.workspace.detachLeavesOfType('CompletionView');

        console.log('Unloading Cyborg Duck plugin');
    }

    async getPromptLibrary(): Promise<Entry[]> {
        if (!this.settings.promptLibraryPath) {
            new Notice('Prompt library path is not set in the plugin settings. Set it before continuing.');
            console.error('Prompt library path is not set in the plugin settings. Set it before continuing.');
            return [];
        }

        // Requiring the file will only work if this is running in a Node.js environment. 
        // If this is running in a browser environment, you'll need a different method to read the file.
        let promptLibrary: Entry[];
        try {
            const data = await fs.readFile(this.settings.promptLibraryPath, 'utf8');
            promptLibrary = JSON.parse(data) as Entry[];
        } catch (error) {
            console.error(`Error reading JSON file: ${error}`);
            return [];
        }

        return promptLibrary
    }

    async setUpHotkeys() {
        const promptLibrary = await this.getPromptLibrary();
        // Create a command for each prompt in the library
        for (const entry of promptLibrary) {
            this.addCommand({
                id: this.generateCommandID(entry.Name),
                name: `Prompt: ${entry.Name}`,
                callback: () => this.performButtonClickActions(entry),
            });
        }

        // Create a custom hotkey for semantic search
        this.addCommand({
            id: 'get-semantic-search-context',
            name: 'Get ARD Relevant Context',
            callback: () => this.displaySemanticSearch(),
        });
    }

    // Helper function to convert the prompt name to a suitable command ID
    generateCommandID(name: string): string {
        // Replace spaces with dashes, convert to lowercase and remove special characters
        return name.replace(/ /g, '-').toLowerCase().replace(/[^a-z0-9-_]/g, '');
    }



    // START OF VIEW-MANAGEMENT SECTION //

    // Creates a new markdown file with the given content and a timestamp-based filename
    async createMarkdownFile(content: string): Promise<TFile> {
        const filename = `Generated-${Date.now()}.md`;
        const file = this.app.vault.create(filename, content);
        return file;
    }
            
    // Opens a given file in a new leaf (tab) in the workspace and sets it as active
    async openFileInNewLeaf(file: TFile) {
        const newLeaf = this.app.workspace.getRightLeaf(false);
        newLeaf.openFile(file);
        this.app.workspace.setActiveLeaf(newLeaf);
    }



    // START OF BUTTON SECTION //
    
    removeAllButtons() {
        const buttons = document.querySelectorAll('.cyborg-duck-button'); // Select all buttons created by this plugin
        buttons.forEach(button => button.remove());
        this.buttonsDisplayed = false;
    }

    // Adds buttons to the markdown view for each entry in the provided prompt library
    async displayButtons(prompt_library: Entry[], markdownView: MarkdownView) {
        const buttonsDiv = document.createElement('div');
        buttonsDiv.classList.add('cyborg-duck-buttons');

        // If usePinecone is false, assume that the Pinecone API key is not valid.
        // Otherwise, get the result of this.isPineconeKeyValid() asynchronously.
        const pineconeValid = this.settings.usePinecone ? await this.isPineconeKeyValid() : false;
        console.log('Pinecone key valid:', pineconeValid);
    
        for (const entry of prompt_library) {
            if (Array.isArray(entry.Prompt) && !(pineconeValid)) {
                continue;
            }

            const button = this.buttonManager.createButton(entry.Name, () => this.performButtonClickActions(entry));
            buttonsDiv.appendChild(button);
        }
        
        // Create custom buttons

        // 1. Semantic search button; call displaySemanticSearch when clicked
        const semanticSearchButton = this.buttonManager.createButton('Get ARD Relevant Context', () => this.displaySemanticSearch());
        buttonsDiv.appendChild(semanticSearchButton);     
        
        // 2. Etc
        
        markdownView.containerEl.parentElement?.appendChild(buttonsDiv);
    }



    // START OF PROMPT CREATION SECTION //

    // Handles the processing and actions when a button related to an entry is clicked
    async performButtonClickActions(entry: Entry) {
        const processedPromptData = await this.createPrompt(entry.Prompt);
        const formattedPromptData = this.formatPromptData(processedPromptData);
    
        this.cyborgDuckView.setPromptText(formattedPromptData);
    
        try {
            await this.streamOpenAICompletion(formattedPromptData);
        } catch (error) {
            console.error("Error with OpenAI completion", error);
        }
    }
    
    // Helper function to transform the processedPromptData into a string
    formatPromptData(promptData: PromptData): string {
        if (typeof promptData === 'string') {
            // If the prompt data is already a string, return it as is
            return promptData;
        } else if (Array.isArray(promptData)) {
            // If the prompt data is an array of Message objects, map each message to a string and join them with line breaks
            return promptData.map(message => `${message.role.charAt(0).toUpperCase() + message.role.slice(1)}: ${message.content}`).join('\n');
        } else {
            // Handle unexpected data types
            throw new Error('Unexpected prompt data type.');
        }
    }

    // Prepares and returns the data to be passed to the OpenAI API. It could be either a simple string or an array of chat messages
    async createPrompt(promptData: PromptData): Promise<PromptData> {
        // Validate prompt data
        if (typeof promptData !== "string" && !Array.isArray(promptData)) {
            throw new Error("Invalid prompt format.");
        }

        // Check for placeholders
        const containsExcerptOrContext = this.doesDataContainPlaceholders(promptData, ['{excerpt}', '{context}']);
        const containsSources = this.doesDataContainPlaceholders(promptData, ['{sources}']);
        
        // Get context and sources
        const [userContext, formattedSources] = await this.retrieveContextAndSources(containsExcerptOrContext, containsSources);
        
        // Replace placeholders with actual values
        const processedPromptData = this.replacePlaceholders(promptData, userContext, formattedSources);
        
        return processedPromptData;
    }

    // Checks if the given data contains any of the specified placeholders
    doesDataContainPlaceholders(data: PromptData, placeholders: string[]): boolean {
        if (typeof data === 'string') {
            return placeholders.some(placeholder => data.includes(placeholder));
        } else {
            return data.some(message => placeholders.some(placeholder => message.content.includes(placeholder)));
        }
    }

    // Replaces the placeholders in the given data with the provided context and sources
    replacePlaceholders(data: PromptData, context: string, sources: string): PromptData {
        if (typeof data === 'string') {
            return data.replace('{excerpt}', context).replace('{context}', context).replace('{sources}', sources);
        } else {
            return data.map(message => ({
                ...message,
                content: message.content.replace('{excerpt}', context).replace('{context}', context).replace('{sources}', sources)
            }));
        }
    }



    // START OF GET CONTEXT SECTION //

    // Retrieves the context from the active markdown note in the workspace, either the highlighted text or based on the settings
    async getContext(): Promise<string> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || activeView.getViewType() !== 'markdown') {
            return ""; // Return an empty string if no markdown note found
        }
    
        const editor = activeView.editor;

        const highlightedText = editor.getSelection();
        if (highlightedText) {
            return highlightedText;
        }
    
        // If no highlighted text, retrieve text based on settings
        switch(this.settings.contextAmount) {
            case 'whole': 
                return editor.getValue();
            case '3-paragraphs':
                return this.getParagraphsFromEditor(editor, 3);
            case '3-sentences':
                return this.getSentencesFromEditor(editor, 3);
            case '1-sentence':
                return this.getSentencesFromEditor(editor, 1);
            default:
                throw new Error('Invalid contextAmount setting.');
        }
    }

    // Extracts a given number of sentences from the end of the note content in the editor
    getSentencesFromEditor(editor: Editor, sentenceCount: number): string {
        const noteContent = editor.getValue();
        const sentences = noteContent.match(/[^.!?]+[.!?]+/g) || []; // simple sentence matcher
    
        // Returns last N sentences
        return sentences.slice(Math.max(sentences.length - sentenceCount, 0)).join(' ');
    }

    // Extracts a given number of paragraphs from the end of the note content in the editor
    getParagraphsFromEditor(editor: Editor, paragraphCount: number): string {
        const noteContent = editor.getValue();
        const paragraphs = noteContent.split(/\n{2,}/g); // simple paragraph matcher
    
        // Returns last N paragraphs
        return paragraphs.slice(Math.max(paragraphs.length - paragraphCount, 0)).join('\n\n');
    }

    // Retrieves the user context and sources based on the flags indicating their presence in the prompt or chat messages
    async retrieveContextAndSources(containsExcerptOrContext: boolean, containsSources: boolean): Promise<[string, string]> {
        let userContext = "";
        let formattedSources = "";
    
        if (containsExcerptOrContext || containsSources) {
            userContext = await this.getContext();
        }
    
        if (containsSources) {
            const queryEmbedding = await this.getEmbedding(userContext);
            const pineconeResponse = await this.getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK);
            if (pineconeResponse instanceof Error) throw pineconeResponse;
    
            formattedSources = this.formatPineconeSources(pineconeResponse);
        }
    
        return [userContext, formattedSources];
    }



    // START OF OPENAI SECTION //

    async getOpenAICompletion(data: PromptData): Promise<string> {
        if (typeof data === 'string') {
            const completion = await this.openai.createCompletion({
                model: this.settings.openaiBaseEngineId,
                prompt: data,
                max_tokens: 60,
                temperature: 0.6,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                stream: false
            });
    
            // Check for undefined values
            if(completion.data.choices && completion.data.choices[0] && completion.data.choices[0].text) {
                return completion.data.choices[0].text;
            }
            else {
                throw new Error("Unexpected API response structure");
            }
        } else if (Array.isArray(data)) {
            const completion = await this.openai.createChatCompletion({
                model: this.settings.openaiChatEngineId,
                messages: data
            });
    
            // Check for undefined values and access the message property (might need to adjust based on OpenAI API spec)
            if(completion.data.choices && completion.data.choices[0] && completion.data.choices[0].message) {
                return completion.data.choices[0].message.content; 
            }
            else {
                throw new Error("Unexpected API response structure");
            }
        } else {
            throw new Error("Invalid type for data");
        }
    }

    async streamOpenAICompletion(prompt: PromptData): Promise<void> {
        const url = 'https://api.openai.com/v1/completions';
        const headers = {
            'Authorization': `Bearer ${this.settings.openaiApiKey}`,
            'Content-Type': 'application/json',
        };
        
        let body: string;
        let model: string;
    
        if (typeof prompt === 'string') {
            model = this.settings.openaiBaseEngineId;
            body = JSON.stringify({
                model: model,
                prompt: prompt,
                max_tokens: 60,
                temperature: 0.6,
                frequency_penalty: 0.0,
                presence_penalty: 0.0,
                stream: true,
            });
        } else if (Array.isArray(prompt)) {
            model = this.settings.openaiChatEngineId;
            body = JSON.stringify({
                model: model,
                messages: prompt,
                stream: true,
            });
        } else {
            throw new Error("Invalid type for prompt");
        }
    
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: body,
        });
    
        if (!response.ok) {
            throw new Error("API request failed");
        }

        if (!response.body) {
            throw new Error("API response body is undefined");
        }
    
        const reader = response.body.getReader();
        let decoder = new TextDecoder();
        let data = '';
        this.cyborgDuckView.completionText.textContent = '';

        const processChunk = async (chunk: ReadableStreamDefaultReadResult<Uint8Array>): Promise<void> => {
            if (chunk.done) {
                // The stream has ended.
                return;
            }
    
            // Add the new data to what we have already.
            data += decoder.decode(chunk.value, { stream: true });
    
            // Process all complete events in the data string.
            let separator;
            while ((separator = data.indexOf('\n\n')) !== -1) {
                // Extract the next complete event from the data string.
                const event = data.slice(0, separator);
    
                // Remove the event from the data string.
                data = data.slice(separator + 2);
    
                if (!event.startsWith('data: ')) {
                    // This is not a data event, ignore it.
                    continue;
                }
    
                // Parse the event data as JSON.
                let json;
                try {
                    json = JSON.parse(event.slice(6));
                } catch (e) {
                    console.log('Failed to parse event: ', event);
                    continue;
                }
    
                // Extract the completion from the JSON.
                if (json.choices && json.choices[0] && json.choices[0].text) {
                    const completion = json.choices[0].text;
                    console.log(completion);
                    this.cyborgDuckView.appendCompletionText(completion);
                }
            }
    
            // Fetch the next chunk of data from the stream.
            return reader.read().then(processChunk);
        };

        return reader.read().then(processChunk);
    }
    
    

    // START OF PINECONE SECTION //

    // List of models:
    // "text-davinci-003" | "text-davinci-002" | "text-davinci-001" | "text-curie-001" | "text-babbage-001" | "text-ada-001" | "davinci" | "curie" | "babbage" | "ada" | "code-davinci-002" | "code-davinci-001" | "code-cushman-002" | "code-cushman-001" | "davinci-codex" | "cushman-codex" | "text-davinci-edit-001" | "code-davinci-edit-001" | "text-embedding-ada-002" | "text-similarity-davinci-001" | "text-similarity-curie-001" | "text-similarity-babbage-001" | "text-similarity-ada-001" | "text-search-davinci-doc-001" | "text-search-curie-doc-001" | "text-search-babbage-doc-001" | "text-search-ada-doc-001" | "code-search-babbage-code-001" | "code-search-ada-code-001" | "gpt2" | "gpt-3.5-turbo" | "gpt-3.5-turbo-0301" | "gpt-4" | "gpt-4-0314" | "gpt-4-32k" | "gpt-4-32k-0314";

    // List of valid tiktoken encodings:
    // "gpt2" | "r50k_base" | "p50k_base" | "p50k_edit" | "cl100k_base";

    // Truncates the provided text to the provided token limit
    truncateText(text: string, tokenLimit: number): string {
        const enc = getEncoding("cl100k_base");
        
        let tokens = enc.encode(text);
        
        // If the token length exceeds the limit, keep only the last TOKEN_LENGTH tokens
        if (tokens.length > tokenLimit) {
            tokens = tokens.slice(-tokenLimit);
        }

        return enc.decode(tokens);
    }

    // Converts the provided text into a 1536-dimensional numerical embedding using the OpenAI API
    async getEmbedding(text: string): Promise<number[]> {
        text = this.truncateText(text, TOKEN_LIMIT);

        const response = await this.openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: text,
        });
        
        const embedding = response.data.data[0].embedding;
        return embedding;
    }

    // Formats the search results from the Pinecone API into a human-readable Markdown string
    formatPineconeOutput(pineconeOutput: PineconeOutput): string {
        if (!pineconeOutput.matches || pineconeOutput.matches.length === 0) {
            return 'No matches found.';
        }
    
        return pineconeOutput.matches.map((match: Match) => {
            const { title, author, text } = match.metadata;
            const modifiedText = text.substring(0, text.indexOf('\n- Title: '));
            return `### ${title}\nBy **${author}**\n\n${modifiedText}\n\n---\n\n`;
        }).join('');
    }
    
    // Generates a unique key for a block of data using its title, author, date, url, and tags
    generateKey(block: Block) {
        return `${block.title}${block.author}${block.date}${block.url}${block.tags}`;
    }
    
    // Combines similar blocks (based on their keys) into a single block and records the minimum index among the combined blocks
    combineBlocks(sortedBlocks: Block[]): {block: Block, minIndex: number}[] {
        return sortedBlocks.reduce((acc, block) => {
            if (acc.length === 0) {
                return [{ block, minIndex: block.oldIndex }];
            }
    
            const prevBlock = acc[acc.length - 1].block;
            if (this.generateKey(prevBlock) === this.generateKey(block)) {
                prevBlock.text += '\n.....\n' + block.text;
                acc[acc.length - 1].minIndex = Math.min(prevBlock.oldIndex, block.oldIndex);
            } else {
                acc.push({ block, minIndex: block.oldIndex });
            }
    
            return acc;
        }, [] as {block: Block, minIndex: number}[]);
    }
    
    // Converts the provided list of combined blocks into a string, ordering them by their minimum index and formatting them for output
    createBlocksOutput(combinedBlocks: {block: Block, minIndex: number}[]): string {
        return combinedBlocks.sort((a, b) => a.minIndex - b.minIndex)
            .map(({ block }, index) => 
                `[${String.fromCharCode('a'.charCodeAt(0) + index)}] ${block.title} - ${block.author} - ${block.date}\n${block.text}\n\n`
            ).join('');
    }
    
    // Formats the search results returned by the Pinecone API into a string representation
    formatPineconeSources(pineconeOutput: PineconeOutput): string {
        if (!pineconeOutput.matches || pineconeOutput.matches.length === 0) {
            return 'No matches found.';
        }
    
        const blocks = pineconeOutput.matches.map(match => ({
            ...match.metadata,
            text: match.metadata.text,
            oldIndex: parseInt(match.id)
        }));
    
        const sortedBlocks = blocks.sort((a, b) => this.generateKey(a).localeCompare(this.generateKey(b)));
        const combinedBlocks = this.combineBlocks(sortedBlocks);
    
        return this.createBlocksOutput(combinedBlocks);
    }

    // Sends a request to the Pinecone API with the provided query embedding and returns the search results
    async getPinecone(queryEmbedding: number[], apiKey: string, topK: number): Promise<PineconeOutput | Error> {
        const headers = {
            'Content-Type': 'application/json',
            'Api-Key': apiKey,
        };
        const body = JSON.stringify({
            includeValues: false,
            includeMetadata: true,
            vector: queryEmbedding,
            namespace: PINECONE_CONSTANTS.NAMESPACE,
            topK: topK,
        });
    
        try {
            const response = await requestUrl({ url: PINECONE_CONSTANTS.URL, headers, method: 'POST', body });
            const data = JSON.parse(response.text);
            return data;
        } catch (error) {
            console.error('Error message:', error.message);
            console.log('This error is possibly from an incorrect API key. Make sure the API key is correct and try again.');
            new Notice('Error fetching response from Pinecone. This error is possibly from an incorrect API key. Make sure the API key is correct and try again.');
            return error;
        }
    }

    async isPineconeKeyValid(): Promise<boolean> {
        const embedding = await this.getEmbedding('');
        const pineconeResponse = await this.getPinecone(embedding, this.settings.pineconeApiKey, 1);
        console.log('Pinecone response:', pineconeResponse);
        return pineconeResponse instanceof Error ? false : true;
    }
    
    // Takes in a context string, performs a semantic search, and returns the formatted search results as a Markdown string and a file containing the Markdown string
    async getSemanticSearchResults(context: string): Promise<{markdown: string, markdownOrFile: TFile}> {
        const queryEmbedding = await this.getEmbedding(context);
        const pineconeResponse = await this.getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK);
        if (pineconeResponse instanceof Error) throw pineconeResponse;
        
        const markdown = this.formatPineconeOutput(pineconeResponse);
        const markdownOrFile = await this.createMarkdownFile(markdown);
        
        return {markdown, markdownOrFile};
    }

    // Retrieves the context for a semantic search, performs the search, and displays the results in a new leaf (file)
    async displaySemanticSearch(): Promise<void> {
        try {
            const context = await this.getContext();
            const {markdown, markdownOrFile} = await this.getSemanticSearchResults(context);
            await this.openFileInNewLeaf(markdownOrFile);
        } catch (error) {
            console.error(error);
            // new Notice(error.message);
        }
    }



    // Miscellanous

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}