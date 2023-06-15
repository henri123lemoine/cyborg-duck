// classes.ts

import { App, PluginSettingTab, Setting } from 'obsidian';
import CyborgDuck from './main';


export const DEFAULT_SETTINGS: CyborgDuckSettings = {
    pineconeApiKey: '',
    openaiApiKey: '',
    contextAmount: 'whole',
    topK: 5,
    openaiBaseEngineId: 'code-davinci-002',
    openaiChatEngineId: 'gpt-3.5-turbo',
    promptLibraryPath: 'prompt-libraries/prompt-library.json',
    usePinecone: false,
    githubPAT: ''
}

export interface CyborgDuckSettings {
    pineconeApiKey: string;
    openaiApiKey: string;
    contextAmount: 'whole' | '3-paragraphs' | '3-sentences' | '1-sentence';
    topK: number;
    openaiBaseEngineId: 'code-davinci-002' | 'text-davinci-003' | 'text-davinci-002' | 'text-curie-001' | 'text-babbage-001' | 'text-ada-001';
    openaiChatEngineId: 'gpt-4' | 'gpt-4-0314' | 'gpt-4-32k' | 'gpt-4-32k-0314' | 'gpt-3.5-turbo' | 'gpt-3.5-turbo-0301';
    promptLibraryPath: string;
    usePinecone: boolean;
    githubPAT: string;
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

        containerEl.createEl('h1', { text: 'Cyborg Duck Settings' });
        
        new Setting(containerEl)
            .setName('GitHub Personal Access Token')
            .setDesc('Your GitHub Personal Access Token (PAT). This is used to authenticate with GitHub. DO NOT SHARE THIS WITH ANYONE.')
            .addText(text => text
                .setPlaceholder('Enter your GitHub PAT')
                .setValue(this.plugin.settings.githubPAT || '')
                .onChange(async (value) => {
                this.plugin.settings.githubPAT = value;
                await this.plugin.saveSettings();
                }));


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
            .setDesc('How much context to send to the LLM?')
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
            .setName('Use Pinecone')
            .setDesc('Check this if you want to use prompts that use knowledge from the Alignment Research Dataset (ARD) to inform the LLM.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.usePinecone)
                .onChange(async (value) => {
                    this.plugin.settings.usePinecone = value;
                    apiKeySetting.settingEl.style.display = value ? 'block' : 'none';
                    topKSetting.settingEl.style.display = value ? 'block' : 'none';
                    await this.plugin.saveSettings();
                }));

        const apiKeySetting = new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your Pinecone API key')
            .addText(text => text
                .setPlaceholder('Enter your API key here...')
                .setValue(this.plugin.settings.pineconeApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.pineconeApiKey = value;
                    await this.plugin.saveSettings();
                }));
    
        const topKSetting = new Setting(containerEl)
            .setName('Top K Results')
            .setDesc('Number of top matching results to return')
            .addText(text => text
                .setPlaceholder('Enter the number of results (default: 5)')
                .setValue(this.plugin.settings.topK.toString())
                .onChange(async (value) => {
                    this.plugin.settings.topK = parseInt(value) || 5;
                    await this.plugin.saveSettings();
                }));

        // Show/hide Pinecone settings based on the initial state
        apiKeySetting.settingEl.style.display = this.plugin.settings.usePinecone ? 'block' : 'none';
        topKSetting.settingEl.style.display = this.plugin.settings.usePinecone ? 'block' : 'none';

    
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
            .setName('OpenAI Base Engine ID')
            .setDesc('Model to use for base completions.')
            .addDropdown(dropdown => 
                dropdown
                    .addOption('code-davinci-002', 'Code Davinci')
                    .addOption('text-davinci-003', 'Text Davinci v3')
                    .addOption('text-davinci-002', 'Text Davinci v2')
                    .addOption('text-curie-001', 'Text Curie')
                    .addOption('text-babbage-001', 'Text Babbage')
                    .addOption('text-ada-001', 'Text Ada')
                    .setValue(this.plugin.settings.openaiBaseEngineId)
                    .onChange(async (value) => {
                        this.plugin.settings.openaiBaseEngineId = value as 'code-davinci-002' | 'text-davinci-003' | 'text-davinci-002' | 'text-curie-001' | 'text-babbage-001' | 'text-ada-001';
                        await this.plugin.saveSettings();
                    }));
        
        new Setting(containerEl)
            .setName('OpenAI Chat Engine ID')
            .setDesc('Model to use for chat completions.')
            .addDropdown(dropdown =>
                dropdown
                    .addOption('gpt-3.5-turbo', 'GPT-3.5 Turbo')
                    .addOption('gpt-3.5-turbo-0301', 'GPT-3.5 Turbo (0301)')
                    .addOption('gpt-4', 'GPT-4')
                    .addOption('gpt-4-0314', 'GPT-4 (0314)')
                    .addOption('gpt-4-32k', 'GPT-4 (32k)')
                    .addOption('gpt-4-32k-0314', 'GPT-4 (32k, 0314)')
                    .setValue(this.plugin.settings.openaiChatEngineId)
                    .onChange(async (value) => {
                        this.plugin.settings.openaiChatEngineId = value as 'gpt-3.5-turbo' | 'gpt-3.5-turbo-0301' | 'gpt-4' | 'gpt-4-0314' | 'gpt-4-32k' | 'gpt-4-32k-0314';
                        await this.plugin.saveSettings();
                    }
                ));
    }
}