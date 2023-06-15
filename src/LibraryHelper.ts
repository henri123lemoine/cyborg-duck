import { App } from 'obsidian';

import { DEFAULT_SETTINGS, CyborgDuckSettings, CyborgDuckSettingTab } from './SettingsHelper';
import { CommandManager } from './CommandManager';
import { Prompt } from "./CustomViews";
import CyborgDuckPlugin from './main';

export interface Entry {
    Name: string;
    Author: string;
    Description: string;
    Image: string;
    "Model name": string;
    "Model type": string;
    "Origin (Tweet / Reddit / Post / ...)": string;
    Prompt: string | any[];
    Tags: string;
}

// list of entries
export interface Library {
    [key: string]: Entry;
}

export class PromptLibraryManager {
    app: App;
    plugin: CyborgDuckPlugin;
    commandManager: CommandManager;

    constructor(app: App, plugin: CyborgDuckPlugin, commandManager: CommandManager) {
        this.app = app;
        this.plugin = plugin;
        this.commandManager = commandManager;
    }

    addPrompt(prompt: Prompt) {
        console.log('Adding entry to library');
        console.log(prompt);
    }
}
