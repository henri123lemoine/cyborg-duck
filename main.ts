import { App, MarkdownView, Plugin, PluginSettingTab, WorkspaceLeaf, ItemView, Notice, Setting, requestUrl, TFile } from 'obsidian';
import { Configuration, OpenAIApi, ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum} from "openai";
import * as fs from 'fs';
import * as path from 'path';

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

interface CyborgDuckSettings {
    pineconeApiKey: string;
    openaiApiKey: string;
    contextAmount: 'whole' | '3-paragraphs' | '3-sentences' | '1-sentence';
    topK: number;
    openaiEngineId: string;
}

const DEFAULT_SETTINGS: CyborgDuckSettings = {
    pineconeApiKey: '',
    openaiApiKey: '',
    contextAmount: 'whole',
    topK: 5,
    openaiEngineId: 'gpt-4',
}

const PINECONE_CONSTANTS = {
    URL: 'https://alignment-search-14c0337.svc.us-east1-gcp.pinecone.io/query',
    NAMESPACE: 'alignment-search'
};

async function getEmbedding(text: string, openai: OpenAIApi): Promise<number[]> {
    const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: text,
    });
    
    const embedding = response.data.data[0].embedding;
    return embedding;
}

async function getPinecone(queryEmbedding: number[], apiKey: string, topK: number): Promise<PineconeOutput | Error> {
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
        console.error(error);
        return error;
    }
}

function formatPineconeOutput(pineconeOutput: PineconeOutput): string {
    let markdown = '';

    if (pineconeOutput.matches && pineconeOutput.matches.length > 0) {
        pineconeOutput.matches.forEach((match: Match, index: number) => {
            const { title, author, text } = match.metadata;
            let modifiedText = text;
            const indexOfTitleTag = text.indexOf('\n- Title: ');
            if (indexOfTitleTag !== -1) {
                modifiedText = text.substring(0, indexOfTitleTag);
            }

            markdown += `### ${title}\n`;
            markdown += `By **${author}**\n\n`;
            markdown += modifiedText + '\n\n';
            markdown += '---\n\n';
        });
    } else {
        markdown = 'No matches found.';
    }

    return markdown;
}

async function createMarkdownFile(app: App, content: string): Promise<TFile | {markdown: string}> {
    const filename = `Generated-${Date.now()}.md`;
    const file = await app.vault.create(filename, content);
    return file;
}

// Fetch a response from the OpenAI API
async function fetchOpenAIResponse(messages: ChatCompletionRequestMessage[], openai: OpenAIApi): Promise<any> {
    try {
        const completion = await openai.createChatCompletion({
            model: this.settings.engine_id,
            messages: messages,
        });

        return completion.data;
    } catch (error) {
        console.error("Error fetching response from OpenAI:", error);
        throw error;
    }
}



class MyCustomView extends ItemView {
    content: string;

    constructor(leaf: WorkspaceLeaf, content: string) {
        super(leaf);
        this.content = content;
    }

    getViewType(): string {
        return 'my-custom-view';
    }

    getDisplayText(): string {
        return 'My Custom View';
    }

    async onOpen() {
        this.contentEl.empty();
        this.contentEl.createEl('div', { text: this.content });
    }
}

export default class CyborgDuck extends Plugin {
    settings: CyborgDuckSettings;
    openai: OpenAIApi;
    
    setOpenAI() {
        const configuration = new Configuration({
            apiKey: this.settings.openaiApiKey,
        });
        this.openai = new OpenAIApi(configuration);
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new CyborgDuckSettingTab(this.app, this));
        this.setOpenAI();
        this.registerView('my-custom-view', (leaf: WorkspaceLeaf) => new MyCustomView(leaf, ''));
        this.addRibbonIcon('dice', 'Open My Custom View', () => this.getTopContext());
    
        this.addCommand({
            id: 'get-context',
            name: 'Get ARD Relevant Context',
            checkCallback: (checking: boolean) => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView) return false;
                if (checking) return true;
                this.getTopContext();
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
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView) return false;
                if (checking) return true;
                this.getTopContext();
            },
            hotkeys: [{
                modifiers: ['Alt'],
                key: 'd',
            }],
        });

    }

    async getTopContext(createLeaf: boolean = true) {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('No active note found.');
            return;
        }
    
        const editor = activeView.editor;
        const noteContent = editor.getValue();
    
        getEmbedding(noteContent, this.openai)
            .then((queryEmbedding) => getPinecone(queryEmbedding, this.settings.pineconeApiKey, this.settings.topK))
            .then((pineconeResponse) => {
                if (pineconeResponse instanceof Error) throw pineconeResponse;
                const markdown = formatPineconeOutput(pineconeResponse);
                if(createLeaf) {
                    return createMarkdownFile(this.app, markdown);
                } else {
                    return Promise.resolve({markdown});
                }
            })
            .then((markdownOrFile) => {
                if (createLeaf && 'path' in markdownOrFile) { // TFile has 'path' property
                    this.openFileInNewLeaf(markdownOrFile);
                } else if (!createLeaf && 'markdown' in markdownOrFile) {
                    console.log(markdownOrFile.markdown);  // or do something else with the markdown content
                }
            })
            .catch((error) => console.error(error));
    }
    
    async openFileInNewLeaf(file: TFile) {
        const newLeaf = this.app.workspace.getRightLeaf(false);
        newLeaf.openFile(file);
        this.app.workspace.setActiveLeaf(newLeaf);
    }

    async getHighlightedText() {
		// Get the active leaf
		const activeLeaf = this.app.workspace.activeLeaf;

		// Check if activeLeaf exists and it is an instance of MarkdownView
		if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
			// Get the CodeMirror editor instance
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
    }

    async getRandomPrompt(model: string): Promise<string> {
        try {
            // Read the JSON file
            const promptLibraryPath = path.resolve(this.manifest.dir || '', 'prompt-library.json');
            const data = fs.readFileSync(promptLibraryPath, 'utf-8');
            const promptLibrary = JSON.parse(data);
        
            if (!(model in promptLibrary["chat-prompts"])) {
                throw new Error(`Model "${model}" not found in the prompt library.`);
            }

            const prompts = promptLibrary["chat-prompts"][model];
            const randomPromptIndex = Math.floor(Math.random() * prompts.length);
            return prompts[randomPromptIndex];

        } catch (error) {
            console.error("Error reading from prompt library:", error);
            throw error;
        }
    }

    async getChatCompletionRequestMessage(context: string = "", sources: string[] = []): Promise<ChatCompletionRequestMessage[]> {
        try {
            const contextPrompt = await this.getRandomPrompt("rubber-duck");
            const messages: ChatCompletionRequestMessage[] = [
                ...sources.map(source => ({role: ChatCompletionRequestMessageRoleEnum.System, content: source})),
                {role: ChatCompletionRequestMessageRoleEnum.System, content: contextPrompt},
                {role: ChatCompletionRequestMessageRoleEnum.User, content: context},
            ];
            return messages;
        } catch (error) {
            console.error("Error creating chat completion request messages:", error);
            throw error;
        }
    }

            
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}


class CyborgDuckSettingTab extends PluginSettingTab {
    plugin: CyborgDuck;

    constructor(app: App, plugin: CyborgDuck) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Cyborg Duck Settings' });

        new Setting(containerEl)
            .setName('Context Amount')
            .setDesc('How much context to send to GPT-3')
            .addDropdown(dropdown => 
                dropdown
                    .addOption('whole', 'Whole note')
                    .addOption('3-paragraphs', 'Last 3 paragraphs')
                    .addOption('3-sentences', 'Last 3 sentences')
                    .addOption('1-sentence', 'Last sentence')
                    .setValue(this.plugin.settings.contextAmount)
                    .onChange(async (value) => {
                        this.plugin.settings.contextAmount = value as 'whole' | '3-paragraphs' | '3-sentences' | '1-sentence';
                        await this.plugin.saveSettings();
                    }));

        containerEl.createEl('h3', { text: 'Pinecone' });

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your Pinecone API key')
            .addText(text => text
                .setPlaceholder('Enter your API key here...')
                .setValue(this.plugin.settings.pineconeApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.pineconeApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Top K Results')
            .setDesc('Number of top matching results to return')
            .addText(text => text
                .setPlaceholder('Enter the number of results (default: 5)')
                .setValue(this.plugin.settings.topK.toString())
                .onChange(async (value) => {
                    this.plugin.settings.topK = parseInt(value) || 5;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'OpenAI' });
        
        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
                .setPlaceholder('Enter your API key here...')
                .setValue(this.plugin.settings.openaiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('OpenAI Engine ID')
            .setDesc('Model to use for completions.')
            .addText(text => text
                .setPlaceholder('Enter the model for completions (default: gpt-4)')
                .setValue(this.plugin.settings.openaiEngineId)
                .onChange(async (value) => {
                    this.plugin.settings.openaiEngineId = value;
                    await this.plugin.saveSettings();
                }));
    }
}