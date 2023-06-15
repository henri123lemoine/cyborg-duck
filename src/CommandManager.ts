// Importing required Obsidian API classes
import { App, MarkdownView, Plugin, Notice, Hotkey, EventRef } from 'obsidian';

// Defining the CommandManager class to manage commands and hotkeys in the plugin
export class CommandManager {
    // Declaring private instance variables for the app, plugin, and a reference to a layout-change event
    private app: App;
    private plugin: Plugin;
    private layoutChangeRef: EventRef;

    // Constructing the CommandManager with a given app and plugin, and creating an event listener for layout changes
    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;

        // Adding a listener for layout changes, showing a notice if no note is open
        this.layoutChangeRef = this.app.workspace.on('layout-change', () => {
            if (!this.getCurrentMarkdownView()) {
                // new Notice('Cyborg Duck: Please open a note to use this plugin.');
            }
        });
    }

    // Removing the layout change listener when the plugin is unloaded
    unload() {
        this.app.workspace.offref(this.layoutChangeRef);
    }

    // Getting the currently active MarkdownView, or null if none exists
    getCurrentMarkdownView(): MarkdownView | null {
        return this.app.workspace.getActiveViewOfType(MarkdownView);
    }

    // Adding a command with a specific ID, name, callback, and hotkey to the plugin
    addCommand(id: string, name: string, callback: () => void, hotkey: Hotkey) {
        const markdownView = this.getCurrentMarkdownView();
        if (!markdownView) {
            // new Notice('Cyborg Duck: Please open a note to use this plugin.');
            return;
        }

        // Adding the command to the plugin with a check callback that invokes the passed callback function
        this.plugin.addCommand({
            id,
            name,
            checkCallback: (checking: boolean) => {
                if (checking) return true;
                callback();
            },
            hotkeys: [hotkey],
        });
    }
}