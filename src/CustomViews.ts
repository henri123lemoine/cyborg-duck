// CustomViews.ts

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { ChatCompletionRequestMessage as Message, ChatCompletionRequestMessageRoleEnum as MessageRole } from 'openai';
import CyborgDuckPlugin from './main';


export const CYBORG_DUCK_VIEW_TYPE = 'cyborg-duck-view';
const CYBORG_DUCK_VIEW_ICON = 'brain-circuit';

type PromptData = string | Message[];
interface ElementAttributes {
    class?: string;
    [key: string]: any;
}

export interface Prompt {
    name: string;
    description: string;
    modelType: ModelType;
    promptData: PromptData;
    pushToGit: boolean;
    author?: string;
    extraAttributes?: ElementAttributes
}

enum ModelType {
    BASE = 'BASE',
    CHAT = 'CHAT',
}


export class CyborgDuckView extends ItemView {
    plugin: CyborgDuckPlugin;

    standardViewContainer: HTMLElement;
    promptText: HTMLElement;
    completionText: HTMLElement;

    addPromptViewContainer: HTMLElement;
    
    constructor(leaf: WorkspaceLeaf, plugin: CyborgDuckPlugin) {
        super(leaf);
        this.plugin = plugin;

        this.createStandardView();
        this.createAddPromptView();
    }

    createStandardView(): void {
        this.standardViewContainer = this.contentEl.createEl('div', { cls: 'cyborg-duck-container', attr: { 'style': 'display: flex;' } });
        this.createPromptSection();
        this.createCompletionSection();
    }
    
    createPromptSection(): void {
        const promptContainer = this.standardViewContainer.createEl('div', { cls: 'cyborg-duck-subcontainer prompt-container-height' });

        const promptTitle = promptContainer.createEl('h3', { text: 'Prompt', cls: 'prompt-title' });

        this.promptText = promptContainer.createEl('p', { text: '', cls: 'prompt-text' });
    
        const updateButton = this.createButton('Update Prompt', () => {
            if (this.promptText.isContentEditable) {
                this.promptText.contentEditable = 'false';
                updateButton.textContent = 'Update Prompt';
            } else {
                this.promptText.contentEditable = 'true';
                updateButton.textContent = 'Save Prompt';
            }
        });
        const deleteButton = this.createButton('Delete Prompt', () => this.promptText.textContent = '');

        promptContainer.appendChild(this.createButtons([updateButton, deleteButton]));
    }
            
    createCompletionSection(): void {
        const completionContainer = this.standardViewContainer.createEl('div', { cls: 'cyborg-duck-subcontainer completion-container-height' });

        const completionTitle = completionContainer.createEl('h3', { text: 'Completion', cls: 'completion-title' });

        this.completionText = completionContainer.createEl('p', { text: '', cls: 'completion-text' });
        this.completionText.addEventListener('click', () => {
            navigator.clipboard.writeText(this.completionText.textContent || '');
            
            // Add class to trigger CSS animation
            this.completionText.classList.add('animate-text');
            setTimeout(() => this.completionText.classList.remove('animate-text'), 400);
        });

        const completeButton = this.createButton('Call Complete Again', async () => {
            try {
                await this.plugin.streamOpenAICompletion(this.promptText.textContent || '');
            } catch (error) {
                console.error("Failed to get completion: ", error);
            }
        });
        completionContainer.appendChild(this.createButtons([completeButton]));
    }

    createAddPromptView(): void {
        this.addPromptViewContainer = this.contentEl.createEl('div', { cls: 'cyborg-duck-container', attr: { 'style': 'display: none;' } });

        const addPromptContainer = this.addPromptViewContainer.createEl('div', { cls: 'cyborg-duck-subcontainer add-prompt-container add-prompt-container-height' });
    
        const addPromptTitle = addPromptContainer.createEl('h3', { text: 'Add Prompt', cls: 'add-prompt-title' });
    
        const addPromptAttributes = addPromptContainer.createEl('div', { cls: 'attributes-input' });
    
        const nameInput = this.createLabeledInput('Name', true, { class: 'name-input' }); 
        addPromptAttributes.appendChild(nameInput);
    
        const descriptionInput = this.createLabeledTextArea('Description', true, { class: 'description-input', rows: '3', style: 'resize: vertical' }); 
        addPromptAttributes.appendChild(descriptionInput);
    
        const modelTypeInput = this.createLabeledModelSelect('Model Type', true); 
        addPromptAttributes.appendChild(modelTypeInput);
    
        const promptInput = this.createLabeledPrompt('Prompt', true); 
        addPromptAttributes.appendChild(promptInput);

        this.updatePromptInputBasedOnModelType(modelTypeInput.querySelector('select'));

        const pushToGitToggle = this.createLabeledToggle('Push to Git', true); 
        addPromptAttributes.appendChild(pushToGitToggle);

        const authorInput = this.createLabeledInput('Author', false, { class: 'author-input' }); 
        addPromptAttributes.appendChild(authorInput);
            
        const submitButton = this.createButton('Submit', this.submitHandler.bind(this));
        const cancelButton = this.createButton('Cancel', this.cancelHandler.bind(this));
        
        const buttonContainer = this.createHTMLElement('div', { class: 'button-container' });
        buttonContainer.appendChild(submitButton);
        buttonContainer.appendChild(cancelButton);
        addPromptContainer.appendChild(buttonContainer);
    }

    createHTMLElement(tag: string, attributes: ElementAttributes = {}, text: string = ''): HTMLElement {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
        if (text) element.textContent = text;
        return element;
    }
    
    createLabeledElement(
        labelText: string,
        tag: string,
        attributes: ElementAttributes = {},
        isRequired: boolean = false
    ): HTMLElement {
        const className = attributes.class ? ` ${attributes.class}` : '';
        const container = this.createHTMLElement('div', { class: `attribute-input${className}${isRequired ? ' required' : ''}` });
    
        const label = this.createHTMLElement('label', { class: 'input-label' }, labelText);
        container.appendChild(label);
    
        const element = this.createHTMLElement(tag, { class: 'input-field', ...attributes });
        container.appendChild(element);
    
        return container;
    }
    
    createLabeledInput(
        labelText: string,
        isRequired: boolean = false,
        attributes: ElementAttributes = { type: 'text' }
    ): HTMLElement {
        return this.createLabeledElement(labelText, 'input', attributes, isRequired);
    }
    
    createLabeledTextArea(
        labelText: string, 
        isRequired: boolean = false, 
        attributes: ElementAttributes = { rows: '3', style: 'resize: vertical' }
    ): HTMLElement {
        return this.createLabeledElement(labelText, 'textarea', attributes, isRequired);
    }
    
    createLabeledModelSelect(
        labelText: string, 
        isRequired: boolean = false
    ): HTMLElement {
        const container = this.createLabeledElement(labelText, 'select', { class: 'model-type-input' }, isRequired);
        const select = container.querySelector('select');
    
        Object.values(ModelType).forEach(modelType => {
            const option = this.createHTMLElement('option', { value: modelType }, modelType);
            select?.appendChild(option);
        });
    
        select?.addEventListener('change', () => {
            this.updatePromptInputBasedOnModelType(select);
        });
    
        return container;
    }
    
    createLabeledPrompt(
        labelText: string, 
        isRequired: boolean = false
    ): HTMLElement {
        const container = this.createHTMLElement('div', { class: `attribute-input prompt-input${isRequired ? ' required' : ''}` });
    
        const label = this.createHTMLElement('label', { class: 'input-label' }, labelText);
        container.appendChild(label);
    
        const promptInputContainer = this.createHTMLElement('div', { class: 'prompt-input-container' });
        container.appendChild(promptInputContainer);
    
        return container;
    }
    
    createLabeledToggle(
        labelText: string, 
        isRequired: boolean = false
    ): HTMLElement {
        return this.createLabeledElement(labelText, 'input', { class: 'git-toggle-input', type: 'checkbox' }, isRequired);
    }
    
    createButton(text: string, clickHandler: (event: MouseEvent) => void): HTMLElement {
        const button = this.createHTMLElement('button', { class: 'input-button' }, text);
        button.addEventListener('click', clickHandler);
        return button;
    }
    
    updatePromptInputBasedOnModelType(select: HTMLSelectElement | null): void {
        if (!select) return;
    
        const modelTypeSelect = this.addPromptViewContainer.querySelector('select');
        const promptContainer = this.addPromptViewContainer.querySelector('.prompt-input') as HTMLElement;
    
        if (!modelTypeSelect || !promptContainer) return;
    
        // If there's no container for prompt inputs yet, create one.
        let promptInputContainer = promptContainer.querySelector('.prompt-input-container') as HTMLElement;
    
        if (!promptInputContainer) {
            promptInputContainer = this.createHTMLElement('div', { class: 'prompt-input-container' });
            promptContainer.appendChild(promptInputContainer);
        }
    
        // Clear existing prompt input field.
        promptInputContainer.innerHTML = '';
    
        // If the model type is chat, create the complex chat message input.
        if (modelTypeSelect.value === ModelType.CHAT) {
            const addMessageButton = this.createHTMLElement('button', { class: 'add-message-button' }, '+');
            const messageContainer = this.createHTMLElement('div', { class: 'message-container' });
        
            addMessageButton.addEventListener('click', () => {
                this.createMessageInput(messageContainer);
            });
        
            promptInputContainer.appendChild(messageContainer);
            promptInputContainer.appendChild(addMessageButton);
                
            // Add the first message input field.
            this.createMessageInput(messageContainer);
        } else { // If the model type is base, create a simple textarea input.
            const basePromptInput = this.createHTMLElement('textarea', { class: 'base-prompt-input', rows: '5', style: 'resize: vertical' });
            promptInputContainer.appendChild(basePromptInput);
        }
    }
        
    createMessageInput(messageContainer: HTMLElement): void {
        const messageInput = this.createHTMLElement('div', { class: 'message-input' });
        const messageRoleSelect = this.createHTMLElement('select', { class: 'message-role-select' });
        const messageContentInput = this.createHTMLElement('textarea', { class: 'message-content-input', rows: '1', style: 'resize: vertical' });
        const removeMessageButton = this.createHTMLElement('button', { class: 'remove-message-button' }, 'x');
        
        ['system', 'user', 'assistant'].forEach(role => {
            const option = this.createHTMLElement('option', { value: role }, role);
            messageRoleSelect.appendChild(option);
        });
    
        removeMessageButton.addEventListener('click', () => {
            messageInput.remove();
        });
    
        messageInput.appendChild(messageRoleSelect);
        messageInput.appendChild(messageContentInput);
        messageInput.appendChild(removeMessageButton);
        messageContainer.appendChild(messageInput);
    }
    
    async submitHandler(): Promise<void> {
        const nameContainer = this.addPromptViewContainer.querySelector<HTMLElement>('.name-input');
        const descriptionContainer = this.addPromptViewContainer.querySelector<HTMLElement>('.description-input');
        const modelTypeContainer = this.addPromptViewContainer.querySelector<HTMLElement>('.model-type-input');
        const promptInputContainer = this.addPromptViewContainer.querySelector<HTMLElement>('.prompt-input-container');
        const pushToGitContainer = this.addPromptViewContainer.querySelector<HTMLElement>('.git-toggle-input');
        const authorContainer = this.addPromptViewContainer.querySelector<HTMLElement>('.author-input');
    
        const nameInput = nameContainer?.querySelector<HTMLInputElement>('input');
        const descriptionInput = descriptionContainer?.querySelector<HTMLTextAreaElement>('textarea');
        const modelTypeInput = modelTypeContainer?.querySelector<HTMLSelectElement>('select');
        const pushToGitToggle = pushToGitContainer?.querySelector<HTMLInputElement>('input');
        const authorInput = authorContainer?.querySelector<HTMLInputElement>('input');
    
        console.log("Inputs:", {nameInput, descriptionInput, modelTypeInput, promptInputContainer, pushToGitToggle, authorInput});
    
        if (!(nameInput && descriptionInput && modelTypeInput && promptInputContainer && pushToGitToggle)) {
            console.log("Missing inputs:", {nameInput, descriptionInput, modelTypeInput, promptInputContainer, pushToGitToggle});
            new Notice("Missing required fields.");
            return;
        }
    
        const name = nameInput.value;
        const description = descriptionInput.value;
        const modelType = modelTypeInput.value;
        const pushToGit = pushToGitToggle.checked;
        const author = authorInput?.value;
    
        console.log("Input Values:", {name, description, modelType, pushToGit, author});
        
        const missing = [];
        if (nameInput.value === "") missing.push("Name");
        if (descriptionInput.value === "") missing.push("Description");
        if (modelTypeInput.value === "") missing.push("Model Type");
    
        if (missing.length) {
            console.log(`Missing required fields: ${missing.join(", ")}`);
            new Notice(`Missing required fields: ${missing.join(", ")}`);
            return;
        }
    
        let promptData: PromptData = '';
        if (modelTypeInput.value === ModelType.BASE) {
            const basePromptInput = promptInputContainer.querySelector<HTMLTextAreaElement>('.base-prompt-input');
            if (!basePromptInput || basePromptInput.value === "") {
                new Notice("Missing required fields: Base Prompt");
                return;
            }
            promptData = basePromptInput.value;
        } else if (modelTypeInput.value === ModelType.CHAT) {
            const messageInputs = promptInputContainer.querySelectorAll<HTMLElement>('.message-input');
            if (messageInputs.length === 0) {
                alert("Missing required fields: Chat Messages");
                return;
            }
            const messages: (Message | null)[] = Array.from(messageInputs).map(messageInput => {
                const roleSelect = messageInput.querySelector<HTMLSelectElement>('.message-role-select');
                const contentInput = messageInput.querySelector<HTMLTextAreaElement>('.message-content-input');
                if (!(roleSelect && contentInput)) return null;  // This should never happen if the UI is correct.
                return { role: roleSelect.value as MessageRole, content: contentInput.value } as Message;
            });
            promptData = messages.filter((msg): msg is Message => msg !== null);
        }
    
        const prompt: Prompt = {
            name: nameInput.value,
            description: descriptionInput.value,
            modelType: modelTypeInput.value as ModelType,
            promptData,
            pushToGit: pushToGitToggle.checked,
            author: authorInput?.value
        };
    
        await this.plugin.promptLibraryManager.addPrompt(prompt);
    
        this.cancelHandler();
    }

    cancelHandler(): void {
        this.addPromptViewContainer.remove();
        this.createAddPromptView();        

        // Swap views
        this.standardViewContainer.style.display = 'flex';
        this.addPromptViewContainer.style.display = 'none';
    }

    // Helper method to create a group of buttons with given texts and click handlers
    createButtons(buttons: HTMLElement[]): HTMLElement {
        const buttonContainer = this.contentEl.createEl('div', { cls: 'button-container' });
        buttons.forEach(button => buttonContainer.appendChild(button));
        return buttonContainer;
    }

    addPromptToLibrary(): void {
        // Swap views
        this.standardViewContainer.style.display = 'none';
        this.addPromptViewContainer.style.display = 'flex';
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
        this.standardViewContainer.remove();
        this.addPromptViewContainer.remove();
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

    appendCompletionText(completion: string) {
        const sanitizedText = this.sanitizeHtml(completion);
        this.completionText.innerHTML += sanitizedText;
    }
}
