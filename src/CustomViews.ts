// CustomViews.ts

import { ItemView, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { ChatCompletionRequestMessage as Message } from 'openai';
import CyborgDuckPlugin from './main';

export const CYBORG_DUCK_VIEW_TYPE = 'cyborg-duck-view';
const CYBORG_DUCK_VIEW_ICON = 'brain-circuit';

type PromptData = string | Message[];

// Adds a view on the Right side of the screen
export class CyborgDuckView extends ItemView {
    plugin: CyborgDuckPlugin;
    container: HTMLElement;
    promptText: HTMLElement;
    completionText: HTMLElement;
    
    constructor(leaf: WorkspaceLeaf, plugin: CyborgDuckPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.container = this.contentEl.createEl('div', { cls: 'cyborg-duck-container' });

        this.createPromptSection();
        this.createCompletionSection();
    }

    // Initialize the Prompt section
    createPromptSection(): void {
        const promptContainer = this.container.createEl('div', { cls: 'prompt-container' });
        promptContainer.createEl('h3', { text: 'Prompt', cls: 'prompt-title' });
        this.promptText = promptContainer.createEl('p', { text: '', cls: 'prompt-text' });
    
        // Create buttons
        const updateButton = this.createButton('Update Prompt', () => this.updatePromptHandler(updateButton)); // Pass updateButton as a parameter
        const deleteButton = this.createButton('Delete Prompt', () => this.promptText.textContent = '');
    
        // Append buttons to the container
        const buttonContainer = this.createButtons([updateButton, deleteButton]);
        promptContainer.appendChild(buttonContainer);
    }
        
    // Handle update prompt button click
    updatePromptHandler(updateButton: HTMLButtonElement): void {
        if (this.promptText.isContentEditable) {
            this.promptText.contentEditable = 'false';
            updateButton.textContent = 'Update Prompt';
        } else {
            this.promptText.contentEditable = 'true';
            updateButton.textContent = 'Save Prompt';
        }
    }
        
    // Initialize the Completion section
    createCompletionSection(): void {
        const completionContainer = this.container.createEl('div', { cls: 'completion-container' });
        completionContainer.createEl('h3', { text: 'Completion', cls: 'completion-title' });
        this.completionText = completionContainer.createEl('p', { text: '', cls: 'completion-text' });
        const completeButton = this.createButton('Call Complete', this.completeHandler.bind(this));  // Using bind to retain 'this' context
        completionContainer.appendChild(completeButton);
    }
    
    // Handle complete button click
    async completeHandler(): Promise<void> {
        try {
            const completion = await this.plugin.getOpenAICompletion(this.promptText.textContent || '');
            this.completionText.textContent = completion;
        } catch (error) {
            console.error("Failed to get completion: ", error);
        }
    }
    
    // Helper method to create a group of buttons with given texts and click handlers
    createButtons(buttons: HTMLElement[]): HTMLElement {
        const buttonContainer = this.contentEl.createEl('div', { cls: 'button-container' });
        buttons.forEach(button => buttonContainer.appendChild(button));
        return buttonContainer;
    }

    createButton(text: string, handler: () => void): HTMLButtonElement {
        const button = this.contentEl.createEl('button', { text, cls: ['mod-cta', 'flex-button'] });
        button.addEventListener('click', handler);
        return button;
    }
    
    getViewType(): string {
        return CYBORG_DUCK_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Cyborg Duck View';
    }

    getIcon(): string {
        return CYBORG_DUCK_VIEW_ICON;
    }

    async onOpen() {
        console.log('CyborgDuckView onOpen');
    }

    async onClose() {
        this.container.remove();
    }

    sanitizeHtml(text: string) {
        return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    
    setPromptText(prompt: PromptData) {
        const sanitizedText = this.sanitizeHtml(JSON.stringify(prompt));
        const formattedText = sanitizedText.replace(/\\n/g, '<br>');
        this.promptText.innerHTML = formattedText;
    }
    
    setCompletionText(completion: string) {
        const sanitizedText = this.sanitizeHtml(completion);
        this.completionText.innerHTML = sanitizedText;
    }
        
    setContent(prompt: PromptData, completion: string) {
        this.promptText.innerHTML = JSON.stringify(prompt);
        this.completionText.innerHTML = completion;
    }
}