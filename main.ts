// main.ts

import * as fs from 'fs/promises';
import { App, MarkdownView, Plugin, Notice, TFile, Editor, requestUrl } from 'obsidian';
import { Configuration, OpenAIApi, ChatCompletionRequestMessage as Message, ChatCompletionRequestMessageRoleEnum } from "openai";
import { getEncoding } from "js-tiktoken";

import { DEFAULT_SETTINGS, CyborgDuckSettings, CyborgDuckSettingTab } from './src/SettingsHelper';
import { CommandManager } from './src/CommandManager';
import { Entry } from './src/LibraryHelper';


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
    private app: App;
    private plugin: CyborgDuck;
    private commandManager: CommandManager;

    constructor(app: App, plugin: CyborgDuck, commandManager: CommandManager) {
        this.app = app;
        this.plugin = plugin;
        this.commandManager = commandManager;
    }

    createButton(entry: Entry): HTMLButtonElement {
        const button = document.createElement('button');
        button.classList.add('cyborg-duck-button'); // This will help to identify buttons created by this plugin
        button.textContent = entry.Name;
        button.addEventListener('click', () => this.plugin.performButtonClickActions(entry));
        return button;
    }
}


export default class CyborgDuck extends Plugin {
    settings: CyborgDuckSettings;
    private openai: OpenAIApi;
    private commandManager: CommandManager;
    private buttonManager: ButtonManager;

    // Use a variable to track if buttons are displayed
    private buttonsDisplayed: boolean = false;

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

        // Add prompt buttons
        this.addRibbonIcon('activity', 'PromptSelect', async () => {
            // Fetching data from local JSON file
            if (!this.settings.promptLibraryPath) {
                new Notice('Prompt library path is not set in the plugin settings. Set it before continuing.');
                console.error('Prompt library path is not set in the plugin settings. Set it before continuing.');
                return;
            }
            
            // Requiring the file will only work if this is running in a Node.js environment. 
            // If this is running in a browser environment, you'll need a different method to read the file.
            let promptLibrary: Entry[];
            try {
                const data = await fs.readFile(this.settings.promptLibraryPath, 'utf8');
                promptLibrary = JSON.parse(data) as Entry[];
            } catch (error) {
                console.error(`Error reading JSON file: ${error}`);
                return;
            }
                    
            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView) {
                this.displayButtons(promptLibrary);
            }
        
            /* Fetch from URL - Discarded for now due to CORS issues.
            const prompt_library_url = 'https://drive.google.com/uc?export=download&id=1n3_Te_tKVeydh3_YnYYG1cG938cQVIZA';
            fetch(prompt_library_url)
                .then(response => response.json())
                .then(data => {
                    this.displayButtons(leaf, data);
                })
                .catch(error => {
                    console.error('Error:', error);
            });
            */
        });

        // this.addCommand({
        //     id: 'get-semantic-search-context',
        //     name: 'Get ARD Relevant Context',
        //     checkCallback: (checking: boolean) => {
        //         if (checking) return true;
        //         this.displaySemanticSearch();
        //     },
        //     hotkeys: [{
        //         modifiers: ['Alt'],
        //         key: 'd',
        //     }],
        // });
    }

    // Clean up any created elements upon plugin unload
    onunload() {
        this.removeAllButtons();
        console.log('Unloading Cyborg Duck plugin');
    }

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


    /////////////////////////////
    // START OF BUTTON SECTION //
    /////////////////////////////
    
    removeAllButtons() {
        const buttons = document.querySelectorAll('.cyborg-duck-button'); // Select all buttons created by this plugin
        buttons.forEach(button => button.remove());
        this.buttonsDisplayed = false;
    }

    // Adds buttons to the markdown view for each entry in the provided prompt library
    async displayButtons(prompt_library: Entry[]) {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) return;

        // Remove existing buttons
        if (this.buttonsDisplayed) {
            this.removeAllButtons();
        } else {
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

                const button = this.buttonManager.createButton(entry);
                buttonsDiv.appendChild(button);
            }
            markdownView.containerEl.parentElement?.appendChild(buttonsDiv);
            this.buttonsDisplayed = true;
        }
    }

    ///////////////////////////
    // END OF BUTTON SECTION //
    ///////////////////////////


    //////////////////////////////////
    // START OF GET CONTEXT SECTION //
    //////////////////////////////////

    // Retrieves the context from the active markdown note in the workspace, either the highlighted text or based on the settings
    private async getContext(): Promise<string> {
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
    private getSentencesFromEditor(editor: Editor, sentenceCount: number): string {
        const noteContent = editor.getValue();
        const sentences = noteContent.match(/[^.!?]+[.!?]+/g) || []; // simple sentence matcher
    
        // Returns last N sentences
        return sentences.slice(Math.max(sentences.length - sentenceCount, 0)).join(' ');
    }

    // Extracts a given number of paragraphs from the end of the note content in the editor
    private getParagraphsFromEditor(editor: Editor, paragraphCount: number): string {
        const noteContent = editor.getValue();
        const paragraphs = noteContent.split(/\n{2,}/g); // simple paragraph matcher
    
        // Returns last N paragraphs
        return paragraphs.slice(Math.max(paragraphs.length - paragraphCount, 0)).join('\n\n');
    }

    // Retrieves the user context and sources based on the flags indicating their presence in the prompt or chat messages
    private async retrieveContextAndSources(containsExcerptOrContext: boolean, containsSources: boolean): Promise<[string, string]> {
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

    ////////////////////////////////
    // END OF GET CONTEXT SECTION //
    ////////////////////////////////


    //////////////////////////////////////
    // START OF PROMPT CREATION SECTION //
    //////////////////////////////////////

    // Handles the processing and actions when a button related to an entry is clicked
    async performButtonClickActions(entry: Entry) {
        const processedPromptData = await this.createPrompt(entry.Prompt);
        console.log('Processed prompt data:', processedPromptData);
        const completion = await this.getOpenAICompletion(processedPromptData);
        const completionFile = await this.createMarkdownFile(completion);
        await this.openFileInNewLeaf(completionFile);
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
    private doesDataContainPlaceholders(data: PromptData, placeholders: string[]): boolean {
        if (typeof data === 'string') {
            return placeholders.some(placeholder => data.includes(placeholder));
        } else {
            return data.some(message => placeholders.some(placeholder => message.content.includes(placeholder)));
        }
    }

    // Replaces the placeholders in the given data with the provided context and sources
    private replacePlaceholders(data: PromptData, context: string, sources: string): PromptData {
        if (typeof data === 'string') {
            return data.replace('{excerpt}', context).replace('{context}', context).replace('{sources}', sources);
        } else {
            return data.map(message => ({
                ...message,
                content: message.content.replace('{excerpt}', context).replace('{context}', context).replace('{sources}', sources)
            }));
        }
    }    

    ////////////////////////////////////
    // END OF PROMPT CREATION SECTION //
    ////////////////////////////////////


    /////////////////////////////
    // START OF OPENAI SECTION //
    /////////////////////////////

    // Makes a request to OpenAI's API, either a chat or text completion depending on the input data type
    async getOpenAICompletion(data: string | Message[]): Promise<any> {
        try {
            const isBaseModel = typeof data === 'string';
            
            if (isBaseModel) {
                const completion = await this.openai.createCompletion({
                    model: 'davinci',
                    prompt: data as string,
                    // max_tokens: 100,
                });
                return completion.data.choices[0].text;
            } else {
                const completion = await this.openai.createChatCompletion({
                    model: 'gpt-3.5-turbo',
                    messages: data,
                });
                return completion.data.choices[0].message?.content;
            }
        } catch (error) {
            console.error("Error fetching response from OpenAI:", error);
            throw error;
        }
    }

    ///////////////////////////
    // END OF OPENAI SECTION //
    ///////////////////////////

    
    ///////////////////////////////
    // START OF PINECONE SECTION //
    ///////////////////////////////

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
    private generateKey(block: Block) {
        return `${block.title}${block.author}${block.date}${block.url}${block.tags}`;
    }
    
    // Combines similar blocks (based on their keys) into a single block and records the minimum index among the combined blocks
    private combineBlocks(sortedBlocks: Block[]): {block: Block, minIndex: number}[] {
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
    private createBlocksOutput(combinedBlocks: {block: Block, minIndex: number}[]): string {
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
    
    // Takes in a context string, performs a semantic search, and returns the formatted search results as a Markdown string
    // and a file containing the Markdown string
    // async getSemanticSearchResults(context: string): Promise<{markdown: string, markdownOrFile: any}> {
    //     const queryEmbedding = await this.getEmbedding(context);
    //     const pineconeResponse = await this.getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK);
    //     if (pineconeResponse instanceof Error) throw pineconeResponse;
        
    //     const markdown = this.formatPineconeOutput(pineconeResponse);
    //     const markdownOrFile = await this.createMarkdownFile(markdown);
        
    //     return {markdown, markdownOrFile};
    // }

    // Retrieves the context for a semantic search, performs the search, and displays the results in a new leaf (file)
    // async displaySemanticSearch(): Promise<void> {
    //     try {
    //         const context = await this.getContext();
    //         const {markdown, markdownOrFile} = await this.getSemanticSearchResults(context);
    //         await this.openFileInNewLeaf(markdownOrFile);
    //     } catch (error) {
    //         console.error(error);
    //         // new Notice(error.message);
    //     }
    // }

    /////////////////////////////
    // END OF PINECONE SECTION //
    /////////////////////////////

    private async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}