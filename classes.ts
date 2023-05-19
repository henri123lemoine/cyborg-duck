// classes.ts

import { App, PluginSettingTab, WorkspaceLeaf, ItemView, Notice, Setting, requestUrl, TFile } from 'obsidian';
import CyborgDuck from './main';


export class MyCustomView extends ItemView {
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


export class CyborgDuckSettingTab extends PluginSettingTab {
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
            .setName('Prompt Library Path')
            .setDesc('Path to the JSON file containing chat prompts for OpenAI models.')
            .addText(text => text
                .setPlaceholder('Enter path here')
                .setValue(this.plugin.settings.promptLibraryPath || '')
                .onChange(async (value) => {
                    this.plugin.settings.promptLibraryPath = value;
                    await this.plugin.saveSettings();
                }));

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