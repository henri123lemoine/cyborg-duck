
// import { Message, MessageRole, ModelType, Prompt, PromptData } from "./Types";

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { ChatCompletionRequestMessage as Message, ChatCompletionRequestMessageRoleEnum as MessageRole } from 'openai';
import CyborgDuckPlugin from './main';

export const CYBORG_DUCK_VIEW_TYPE = 'cyborg-duck-view';
const CYBORG_DUCK_VIEW_ICON = 'brain-circuit';

type PromptData = string | Message[];
type ElementAttributes = { [key: string]: string };

interface Prompt {
    name: string;
    description: string;
    modelType: string;
    promptData: PromptData;
    author?: string;
    extraAttributes?: ElementAttributes
}

enum ModelType {
    CHAT = 'CHAT',
    BASE = 'BASE',
}


export class CyborgDuckView extends ItemView {
    plugin: CyborgDuckPlugin;

    standardViewContainer: HTMLElement;
    addPromptViewContainer: HTMLElement;

    nameInput: HTMLInputElement;
    descriptionInput: HTMLInputElement;
    modelTypeInput: HTMLSelectElement;
    promptInput: CustomPromptInput;
    authorInput: HTMLInputElement;
    optionalAttributes: Array<HTMLInputElement | HTMLTextAreaElement>;

    constructor() {
        super();

        this.standardViewContainer = document.querySelector('.standard-view') as HTMLElement;
        this.addPromptViewContainer = document.querySelector('.add-prompt-view') as HTMLElement;

        this.nameInput = document.querySelector('.add-prompt-view .name-input') as HTMLInputElement;
        this.descriptionInput = document.querySelector('.add-prompt-view .description-input') as HTMLInputElement;
        this.modelTypeInput = document.querySelector('.add-prompt-view .model-type-input') as HTMLSelectElement;
        this.promptInput = new CustomPromptInput(this.modelTypeInput);
        this.authorInput = document.querySelector('.add-prompt-view .author-input') as HTMLInputElement;
        this.optionalAttributes = [];
    }

    addButtonHandler(): void {
        // Swap views
        this.standardViewContainer.style.display = 'none';
        this.addPromptViewContainer.style.display = 'flex';
    }

    confirmPromptHandler(): void {
        // Check required inputs
        const requiredInputs = [
            { name: 'Name', value: this.nameInput.value },
            { name: 'Description', value: this.descriptionInput.value },
            { name: 'Model Type', value: this.modelTypeInput.value },
        ];

        let promptData: PromptData;

        if (this.modelTypeInput.value === 'CHAT') {
            // Convert the HTML inputs to a Message array
            const chatElement = this.promptInput.input as HTMLChatElement;
            const messages: Message[] = chatElement.messageInputs.map(input => {
                const roleSelect = input.querySelector('.role-select');
                const contentInput = input.querySelector('textarea');

                if (!roleSelect || !contentInput) {
                    // If the necessary inputs aren't found, return a default value
                    return { role: 'user', content: '' };
                }

                return {
                    role: (roleSelect as HTMLSelectElement).value as MessageRole,
                    content: (contentInput as HTMLTextAreaElement).value,
                };
            });

            // Add a check for messages
            requiredInputs.push({ name: 'Messages', value: JSON.stringify(messages) });
            promptData = messages;
        } else {
            // Add a check for the base prompt
            requiredInputs.push({ name: 'Prompt', value: (this.promptInput.input as HTMLTextAreaElement).value });
            promptData = (this.promptInput.input as HTMLTextAreaElement).value;
        }

        const missingInputs = requiredInputs.filter(input => !input.value);
        if (missingInputs.length > 0) {
            const missingNames = missingInputs.map(input => input.name);
            alert(`Missing required inputs: ${missingNames.join(', ')}`);
            return;
        }

        // Create a new Prompt object
        const newPrompt: Prompt = {
            name: this.nameInput.value,
            description: this.descriptionInput.value,
            modelType: this.modelTypeInput.value,
            promptData: promptData,
            author: this.authorInput.value,
            extraAttributes: this.optionalAttributes.reduce((obj, input, index) => {
                // Assuming the even-indexed inputs are the keys and the odd-indexed inputs are the values
                if (index % 2 === 0) obj[input.value] = this.optionalAttributes[index + 1].value;
                return obj;
            }, {} as Record<string, string>)
        };

        // Use a service to send the new Prompt to a server (not shown)
    }

    cancelButtonHandler(): void {
        // Swap views
        this.standardViewContainer.style.display = 'flex';
        this.addPromptViewContainer.style.display = 'none';

        // Clear the inputs
        this.nameInput.value = '';
        this.descriptionInput.value = '';
        this.modelTypeInput.value = '';
        this.promptInput.clear();
        this.authorInput.value = '';
        this.optionalAttributes.forEach(input => input.value = '');
    }
}

class CustomPromptInput {
    modelTypeSelect: HTMLSelectElement;
    input: HTMLInputElement | HTMLTextAreaElement | HTMLChatElement;

    constructor(modelTypeSelect: HTMLSelectElement) {
        this.modelTypeSelect = modelTypeSelect;
        this.input = document.createElement('input');
        this.updateInput();
    }

    updateInput(): void {
        if (this.modelTypeSelect.value === ModelType.CHAT) {
            // Create a chat input
            this.input = new HTMLChatElement();
        } else {
            // Create a text area input
            this.input = document.createElement('textarea');
        }
    }

    clear(): void {
        if (this.modelTypeSelect.value === ModelType.CHAT) {
            // Clear the chat input
            (this.input as HTMLChatElement).messageInputs.forEach(input => {
                const roleSelect = input.querySelector('.role-select') as HTMLSelectElement;
                const contentInput = input.querySelector('textarea') as HTMLTextAreaElement;

                roleSelect.value = '';
                contentInput.value = '';
            });
        } else {
            // Clear the text area input
            (this.input as HTMLTextAreaElement).value = '';
        }
    }
}

class HTMLChatElement extends HTMLElement {
    messageInputs: HTMLElement[];

    constructor() {
        super();
        this.messageInputs = [];
        this.addMessageInput();
    }

    addMessageInput(): void {
        const messageInput = document.createElement('div');
        messageInput.classList.add('message-input');

        const roleSelect = document.createElement('select');
        roleSelect.classList.add('role-select');
        roleSelect.options.add(new Option('User', 'user'));
        roleSelect.options.add(new Option('Assistant', 'assistant'));
        messageInput.appendChild(roleSelect);

        const contentInput = document.createElement('textarea');
        contentInput.classList.add('content-input');
        messageInput.appendChild(contentInput);

        this.messageInputs.push(messageInput);
        this.appendChild(messageInput);
    }
}

customElements.define('html-chat-element', HTMLChatElement);

export default CustomViews;
