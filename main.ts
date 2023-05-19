// core modules
import { App, MarkdownView, Plugin, PluginSettingTab, WorkspaceLeaf, ItemView, Notice, Setting, requestUrl, TFile } from 'obsidian';

// third-party modules
import { Configuration, OpenAIApi, ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum} from "openai";
import * as fs from 'fs';
import * as path from 'path';

// local modules
import { 
    Metadata, 
    Match, 
    PineconeOutput, 
    CyborgDuckSettings, 
    PINECONE_CONSTANTS, 
    DEFAULT_SETTINGS,
    getEmbedding,
    getPinecone,
    formatPineconeOutput,
    formatPineconeSources,
    createMarkdownFile,

} from './helper';
import { MyCustomView, CyborgDuckSettingTab } from './classes';

// defining constants
const DEFAULT_ENGINE_ID = 'gpt-4';
const RIBBON_ICON_NAME = 'dice';
const VIEW_NAME = 'my-custom-view';

class CommandManager {
    private app: App;
    private plugin: CyborgDuck;

    constructor(app: App, plugin: CyborgDuck) {
        this.app = app;
        this.plugin = plugin;
    }

    isActiveMarkdownViewAvailable(): boolean {
        return !!this.app.workspace.getActiveViewOfType(MarkdownView);
    }
}

export default class CyborgDuck extends Plugin {
    settings: CyborgDuckSettings;
    private openai: OpenAIApi;
    private commandManager: CommandManager;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new CyborgDuckSettingTab(this.app, this));
        this.setOpenAI();
        this.commandManager = new CommandManager(this.app, this);
        this.registerView(VIEW_NAME, (leaf: WorkspaceLeaf) => new MyCustomView(leaf, ''));
        this.addRibbonIcon(RIBBON_ICON_NAME, 'Open My Custom View', () => this.generateAndDisplayContext());
    
        this.addCommand({
            id: 'get-context',
            name: 'Get ARD Relevant Context',
            checkCallback: (checking: boolean) => {
                if (!this.commandManager.isActiveMarkdownViewAvailable()) return false;
                if (checking) return true;
                // this.getTopContext();
                this.generateAndDisplayContext();
            },
            hotkeys: [{
                modifiers: ['Alt'],
                key: 'd',
            }],
        });

        this.addCommand({
            id: 'get-random-prompt-completion',
            name: 'Get Random Prompt Completion',
            checkCallback: (checking: boolean) => {
                if (!this.commandManager.isActiveMarkdownViewAvailable()) return false;
                if (checking) return true;
                this.getRandomPromptCompletion();
            },
            hotkeys: [{
                modifiers: ['Alt'],
                key: 'f',
            }],
        });

        // this.addCommand({
        //     id: 'get-openai-completion',
        //     name: 'Get OpenAI Completion',
        //     checkCallback: (checking: boolean) => {
        //         if (!this.commandManager.isActiveMarkdownViewAvailable()) return false;
        //         if (checking) return true;
        //         this.getOpenAICompletion();
        //     },
        //     hotkeys: [{
        //         modifiers: ['Alt'],
        //         key: 'g',
        //     }],
        // });
    }

    private async getContext(): Promise<{markdown: string, markdownOrFile: any}> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            throw new Error('No active note found.');
        }
    
        const editor = activeView.editor;
        const noteContent = editor.getValue();
    
        const queryEmbedding = await getEmbedding(noteContent, this.openai);
        const pineconeResponse = await getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK);
        if (pineconeResponse instanceof Error) throw pineconeResponse;
    
        const markdown = formatPineconeOutput(pineconeResponse);
        const markdownOrFile = await createMarkdownFile(this.app, markdown);
    
        return {markdown, markdownOrFile};
    }
    
    private async displayContext(createLeaf: boolean, {markdown, markdownOrFile}: {markdown: string, markdownOrFile: any}): Promise<void> {
        if (createLeaf && 'path' in markdownOrFile) { // TFile has 'path' property
            await this.openFileInNewLeaf(markdownOrFile);
        } else if (!createLeaf) {
            console.log(markdown);  // or do something else with the markdown content
        }
    }
    
    public async generateAndDisplayContext(createLeaf: boolean = true): Promise<void> {
        try {
            const context = await this.getContext();
            await this.displayContext(createLeaf, context);
        } catch (error) {
            console.error(error);
            new Notice(error.message);
        }
    }

    async openFileInNewLeaf(file: TFile) {
        const newLeaf = this.app.workspace.getRightLeaf(false);
        newLeaf.openFile(file);
        this.app.workspace.setActiveLeaf(newLeaf);
    }

    private async getHighlightedText(): Promise<string | null> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

        // Check if activeView exists
        if (activeView) {
            const editor = activeView.editor;
            const selection = editor.getSelection();
            return selection;
        } else {
            // Return null if no MarkdownView is active or no text is selected
            return null;
        }
    }

    private async getRandomPrompt(): Promise<ChatCompletionRequestMessage[]> {
        try {
            // Read the JSON file
            const promptLibraryPath = this.settings.promptLibraryPath;
            if (!promptLibraryPath) {
                throw new Error("Prompt library path is not set in the plugin settings.");
            }
    
            const data = fs.readFileSync(promptLibraryPath, 'utf8');
            const promptLibrary = JSON.parse(data);
        
            const promptObject = promptLibrary["chat-prompts"];
            
            // Convert the prompt object into an array
            let allPrompts: any[][] = []; // Each item in allPrompts is an array
            for (const key in promptObject) {
                if (promptObject.hasOwnProperty(key)) {
                    allPrompts.push(promptObject[key]);
                }
            }
            
    
            // Now you can select a random prompt from allPrompts
            const randomPromptIndex = Math.floor(Math.random() * allPrompts.length);
            const randomPromptString: any[] = allPrompts[randomPromptIndex];

    
            // Parse the random prompt string into a JSON object/array of objects
            const randomPromptObj = randomPromptString;

            console.log("Random prompt object:", randomPromptObj);
    
            return this.translateMessages(randomPromptObj);
        }
        // Handle exceptions (such as file not found, JSON parsing error, etc.) here
        catch (error) {
            console.error(error);
            throw error;
        }
    }

    private async translateMessages(messages: any[]): Promise<ChatCompletionRequestMessage[]> {
        return messages.map((message) => {
            return {
                role: message["role"] as ChatCompletionRequestMessageRoleEnum,
                content: message["content"],
            };
        });
    }

    private async getMessage(unbuiltMessage: ChatCompletionRequestMessage[]): Promise<{message: ChatCompletionRequestMessage[]}> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            throw new Error('No active note found.');
        }
        
        const editor = activeView.editor;
        const userContext = editor.getValue();
        
        const queryEmbedding = await getEmbedding(userContext, this.openai);
        const pineconeResponse = await getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK);
        if (pineconeResponse instanceof Error) throw pineconeResponse;
        
        const formattedSources = formatPineconeSources(pineconeResponse);
        
        return {message: this.getChatCompletionRequestMessage(unbuiltMessage, userContext, formattedSources)};
    }
    
    private getChatCompletionRequestMessage(messages: ChatCompletionRequestMessage[], context: string = "", sources: string = ""): ChatCompletionRequestMessage[] {
        return messages.map(message => {
            return {
                ...message,
                content: message.content.replace('{context}', context).replace('{sources}', sources)
            };
        });
    }

    private async getRandomPromptCompletion() {
        try {
            const prompt = await this.getRandomPrompt();
            const { message } = await this.getMessage(prompt);
            
            const completionResponse = await this.fetchOpenAIResponse(message, this.openai);
            console.log("Completion from OpenAI:", completionResponse);
            
            const completion = completionResponse.choices[0].message.content
            console.log("Completion:", completion);
            const completionFile = await createMarkdownFile(this.app, completion);
            
            await this.openFileInNewLeaf(completionFile);
        } catch (error) {
            console.error(error);
            new Notice(error.message);
        }
    }
        
    // private async getOpenAICompletion() {
    //     const selectedText = await this.getHighlightedText();
    //     if (selectedText) {
    //         const messages = await this.getChatCompletionRequestMessage(selectedText);
    //         console.log("Messages for OpenAI API:", messages);
    //         const completion = await this.fetchOpenAIResponse(messages, this.openai);
    //         console.log("Completion from OpenAI:", completion);
    //         new Notice(completion.choices[0].message.content);  // This will create a notification modal with completion
    //     } else {
    //         new Notice("No text selected.");
    //     }
    // }

    private async fetchOpenAIResponse(messages: ChatCompletionRequestMessage[], openai: OpenAIApi): Promise<any> {
        try {
            const completion = await openai.createChatCompletion({
                model: this.settings.openaiEngineId,
                messages: messages,
            });
    
            return completion.data;
        } catch (error) {
            console.error("Error fetching response from OpenAI:", error);
            throw error;
        }
    }

    private async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private setOpenAI() {
        const configuration = new Configuration({
            apiKey: this.settings.openaiApiKey,
        });
        this.openai = new OpenAIApi(configuration);
    }
}

// [
//     {"system": "You are a knowledgeable rubber-duck assistant, capable of context-driven reasoning and informed by specific sources."},
//     {"user": "Below you will find a selection of sources from the Alignment Research Dataset, followed by a user-written text. Your task is to digest the provided sources and use them to generate thoughtful questions about the user's text. These questions should aim to stimulate further thinking, correct any misconceptions, and preemptively answer queries that a reader might have while reading.\n\n{sources}\n\nText:\n---\n{context}\n---\n\nPlease generate 5 informed, relevant, and thought-provoking questions based on this context. Cite any specific information drawn from the sources in your questions using the format: [a], [b], etc. If you use multiple sources to inform a question, cite all of them."}
// ],