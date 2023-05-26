// main.ts

// core modules
import * as fs from 'fs/promises';
import { App, MarkdownView, Plugin, PluginSettingTab, WorkspaceLeaf, ItemView, Notice, Setting, requestUrl, TFile, Editor } from 'obsidian';

// third-party modules
import { Configuration, OpenAIApi, ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum, ChatCompletionResponseMessage, CreateChatCompletionResponse, CreateCompletionResponse } from "openai";

// local modules
import { 
    Metadata, 
    Match, 
    Entry, 
    PineconeOutput, 
    CyborgDuckSettings, 
    PINECONE_CONSTANTS, 
    DEFAULT_SETTINGS,
    getPromptByName, 
    getEmbedding,
    getPinecone,
    formatPineconeOutput,
    formatPineconeSources,
    createMarkdownFile,

} from './helper';
import { MyCustomView, CyborgDuckSettingTab } from './classes';

// defining constants
const DEFAULT_ENGINE_ID = 'gpt-4';
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

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new CyborgDuckSettingTab(this.app, this));

        this.setOpenAI();
        this.commandManager = new CommandManager(this.app, this);
        this.registerView(VIEW_NAME, (leaf: WorkspaceLeaf) => new MyCustomView(leaf, ''));

        // this.addRibbonIcon('dice', 'Ask GPT', () => {
        //     this.generateAndDisplayContext()
        //     // // Called when the user clicks the icon.
		// 	// const lastSentence = await this.readLastSentence();
		// 	// const openAiResponse = await this.sendTextToOpenAI(lastSentence)
		// 	// new Notice(openAiResponse)
        // });
        
        this.addRibbonIcon('activity', 'PromptSelect', async () => {
            // Fetching data from local JSON file
            if (!this.settings.promptLibraryPath) {
                new Notice('Prompt library path is not set in the plugin settings. Set it before continuing.');
                return;
            }
            
            // Requiring the file will only work if this is running in a Node.js environment. 
            // If this is running in a browser environment, you'll need a different method to read the file.
            let prompt_library: Entry[] = [];
            try {
              const data = await fs.readFile(this.settings.promptLibraryPath, 'utf8');
              prompt_library = JSON.parse(data);
            } catch (error) {
              console.error(`Error reading JSON file: ${error}`);
            }
                    
            // Logging to console for debugging purposes
            console.log(prompt_library);
        
            // This seems to be the part where you're working with the data from your JSON file.
            const leaf = this.app.workspace.getRightLeaf(false);
            if (leaf) {
                await this.displayButtons(leaf, prompt_library);
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

        this.addCommand({
            id: 'get-semantic-search-context',
            name: 'Get ARD Relevant Context',
            checkCallback: (checking: boolean) => {
                if (!this.commandManager.isActiveMarkdownViewAvailable()) return false;
                if (checking) return true;
                this.displaySemanticSearch();
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

        this.addCommand({
            id: 'temp-test-command',
            name: 'Temp Test Command',
            checkCallback: (checking: boolean) => {
                if (!this.commandManager.isActiveMarkdownViewAvailable()) return false;
                if (checking) return true;
                // add test code here

            },
            hotkeys: [{
                modifiers: ['Alt'],
                key: 'g',
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

    onunload() {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const buttonsDiv = leaf.containerEl.querySelector('.my-plugin-buttons');
            if (buttonsDiv) {
                buttonsDiv.remove();
            }
        });
    }

    private async displayButtons(leaf: WorkspaceLeaf, prompt_library: Entry[]) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || activeView.getViewType() !== 'markdown') {
            throw new Error('No active note found.');
        }

		const buttonsDiv = document.createElement('div');
		buttonsDiv.addClass('my-plugin-buttons');

        // Reminder:
        /* export interface Entry {
            Name: string;
            Author: string;
            Description: string;
            Image: string;
            "Model name": string;
            "Model type": string;
            "Origin (Tweet / Reddit / Post / ...)": string;
            Prompt: string | any[];//ChatCompletionRequestMessage[];
            Tags: string;
        } */

        for (const entry of prompt_library) {
            if (entry['Model type'] === 'CHAT') {
                console.log(`Entry ${entry.Name} is a chat model.`);
            }

            const button_i = document.createElement('button');
            button_i.addClass('my-plugin-prompt');
            button_i.addEventListener('click', async () => {
                console.log(`Button ${entry.Name} clicked.`)
                await this.buttonClick(entry);
            });
            button_i.innerText = entry.Name;
            buttonsDiv.appendChild(button_i);
        }

        // Deal with later
        /* const custom = document.createElement('button');
        custom.addClass('my-plugin-prompt');
        custom.addEventListener('click', async () => {
            await this.buttonClick(entry);
        });
        custom.innerText = "";
        buttonsDiv.appendChild(custom); */

        // Print prompt-count
        console.log(`Prompt count: ${prompt_library.length}`);

        activeView.containerEl.parentElement?.appendChild(buttonsDiv);
    }

    private async buttonClick(entry: Entry) {
        if (typeof entry.Prompt === "string") {
            // fetch prompt details
            const updatedPrompt = await this.buildPrompt(entry.Prompt);
            // fetch completion from base OpenAI
            const completion = await this.getOpenAICompletion(updatedPrompt, true, this.openai);
            console.log("Completion from OpenAI:", completion);
            // create new file
            const completionFile = await createMarkdownFile(this.app, completion);
            // open file in new leaf
            await this.openFileInNewLeaf(completionFile);
        } else if (Array.isArray(entry.Prompt)) {
            // fetch prompt details
            const updatedMessageObject = await this.buildMessages(entry.Prompt);
            const updatedMessage = updatedMessageObject.message; // Extract the message array from the object
            // fetch completion from GPT-3.5 Turbo
            const completion = await this.getOpenAICompletion(updatedMessage, false, this.openai);
            console.log("Completion from OpenAI:", completion);
            // create new file
            const completionFile = await createMarkdownFile(this.app, completion);
            // open file in new leaf
            await this.openFileInNewLeaf(completionFile);
        } else {
            throw new Error("Invalid prompt format.");
        }
    }

    private async buildPrompt(prompt: string): Promise<string> {
        // Check if the prompt contains '{excerpt}' or '{context}', or if it contains '{sources}'
        const containsExcerptOrContext = prompt.includes('{excerpt}') || prompt.includes('{context}');
        const containsSources = prompt.includes('{sources}');
        
        let userContext = "";
        let formattedSources = "";
    
        // If the message contains an excerpt or context, replace it with the user context
        if (containsExcerptOrContext || containsSources) {
            userContext = await this.getContext();
        }
        // If the message contains sources, replace it with the sources from Pinecone
        if (containsSources) {
            const queryEmbedding = await getEmbedding(userContext, this.openai);
            const pineconeResponse = await getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK);
            if (pineconeResponse instanceof Error) throw pineconeResponse;
        
            formattedSources = formatPineconeSources(pineconeResponse);
        }
    
        // Replace '{excerpt}', '{context}', and '{sources}' in the prompt with user context and formatted sources
        prompt = prompt.replace('{excerpt}', userContext).replace('{context}', userContext).replace('{sources}', formattedSources);
        
        return prompt;
    }
    
    private async buildMessages(unbuiltMessages: any[]): Promise<{message: ChatCompletionRequestMessage[]}> {
        // First, translate the messages to ChatCompletionRequestMessage[]
        unbuiltMessages = await this.translateMessages(unbuiltMessages);

        // Using regex, check if unbuiltMessage contains an '{excerpt}' or '{context}', or if it contains '{sources}'
        // If so, replace it with the user context, and the sources from Pinecone, respectively
        const containsExcerptOrContext = unbuiltMessages.some(message => message.content.includes('{excerpt}') || message.content.includes('{context}'));
        const containsSources = unbuiltMessages.some(message => message.content.includes('{sources}'));
        
        let userContext = "";
        let formattedSources = "";

        // If the message contains an excerpt or context, replace it with the user context
        if (containsExcerptOrContext || containsSources) {
            userContext = await this.getContext();
        }
        // If the message contains sources, replace it with the sources from Pinecone
        if (containsSources) {
            const queryEmbedding = await getEmbedding(userContext, this.openai);
            const pineconeResponse = await getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK);
            if (pineconeResponse instanceof Error) throw pineconeResponse;
        
            const formattedSources = formatPineconeSources(pineconeResponse);
        }
        
        return { message: this.getChatCompletionRequestMessage(unbuiltMessages, userContext, formattedSources) };
    }

    private getChatCompletionRequestMessage(messages: ChatCompletionRequestMessage[], context: string = "", sources: string = ""): ChatCompletionRequestMessage[] {
        return messages.map(message => {
            return {
                ...message,
                content: message.content.replace('{excerpt}', context).replace('{context}', context).replace('{sources}', sources)
            };
        });
    }

    private async getOpenAICompletion(data: string | ChatCompletionRequestMessage[], isBaseModel: boolean, openai: OpenAIApi): Promise<any> {
        try {
            if (isBaseModel) {
                // If it's a base model, we will use OpenAI's CreateCompletion API
                const completion = await openai.createCompletion({
                    model: 'davinci',//'code-davinci-002', // this.settings.openaiEngineId,
                    prompt: data as string, // cast to string, as data must be string for base models
                    max_tokens: 100, // You can adjust this value as per your need
                });
    
                return completion.data.choices[0].text;
    
            } else {
                // If it's a chat model, we will use OpenAI's CreateChatCompletion API
                const completion = await openai.createChatCompletion({
                    model: 'gpt-3.5-turbo', // this.settings.openaiEngineId,
                    messages: data as ChatCompletionRequestMessage[], // cast to ChatCompletionRequestMessage[], as data must be message array for chat models
                });
    
                return completion.data.choices[0].message?.content;
            }
        } catch (error) {
            console.error("Error fetching response from OpenAI:", error);
            throw error;
        }
    }
    
    private async getContext(): Promise<string> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || activeView.getViewType() !== 'markdown') {
            throw new Error('No active markdown note found.');
        }
    
        const editor = activeView.editor;
    
        // Check for highlighted text
        const highlightedText = await this.getHighlightedText();
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
    
    private getSentencesFromEditor(editor: Editor, sentenceCount: number): string {
        const noteContent = editor.getValue();
        const sentences = noteContent.match(/[^.!?]+[.!?]+/g) || []; // simple sentence matcher
    
        // Returns last N sentences
        return sentences.slice(Math.max(sentences.length - sentenceCount, 0)).join(' ');
    }
    
    private getParagraphsFromEditor(editor: Editor, paragraphCount: number): string {
        const noteContent = editor.getValue();
        const paragraphs = noteContent.split(/\n{2,}/g); // simple paragraph matcher
    
        // Returns last N paragraphs
        return paragraphs.slice(Math.max(paragraphs.length - paragraphCount, 0)).join('\n\n');
    }

    private async getSemanticSearchResults(context: string): Promise<{markdown: string, markdownOrFile: any}> {
        const queryEmbedding = await getEmbedding(context, this.openai);
        const pineconeResponse = await getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK);
        if (pineconeResponse instanceof Error) throw pineconeResponse;
        
        const markdown = formatPineconeOutput(pineconeResponse);
        const markdownOrFile = await createMarkdownFile(this.app, markdown);
        
        return {markdown, markdownOrFile};
    }
    
    public async displaySemanticSearch(): Promise<void> {
        try {
            const context = await this.getContext();
            const {markdown, markdownOrFile} = await this.getSemanticSearchResults(context);
            await this.openFileInNewLeaf(markdownOrFile);
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