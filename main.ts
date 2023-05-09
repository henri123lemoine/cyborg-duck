import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile, MarkdownView, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

const OPENAI_API_KEY = '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';
const OPENAI_API_BASE = 'https://api.openai.com/v1/chat/completions';
const ENGINE_ID = 'gpt-3.5-turbo';

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Ask GPT', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			const lastSentence = await this.readLastSentence();
			const openAiResponse = await this.sendTextToOpenAI(lastSentence)
			new Notice(openAiResponse)
		});

		this.addRibbonIcon('activity', 'PromptSelect', async () => {
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
			  await this.displayButtons(leaf);
			}
		  });

		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  		this.addSettingTab(new SampleSettingTab(this.app, this));

		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

		this.addCommand({
			id: 'start-periodic-popup',
		  	name: 'Start periodic popup notifications',
		  	callback: () => {
				this.startPeriodicPopup(500); // Show a popup every 5000 milliseconds (5 seconds)
			},
		});

		// Add a new command to stop periodic popups
		this.addCommand({
		  	id: 'stop-periodic-popup',
		  	name: 'Stop periodic popup notifications',
		  	callback: () => {
				this.stopPeriodicPopup();
		  	},
		});

		this.addCommand({
			  id: 'read-last-sentence',
			  name: 'Read last sentence',
			  callback: () => {
				this.readLastSentence();
			  },
			});

		this.addCommand({
			id: 'send-text-to-openai',
		  	name: 'Send text to OpenAI',
		  	callback: async () => {
		  		new Notice('Test OpenAI call')
				const prompt = 'Write a Python function that takes a string as input and returns the reversed string:';
				const output = await this.sendTextToOpenAI(prompt);
				new Notice(`OpenAI output: ${output}`);
		  },
		});
	}

	async displayButtons(leaf: WorkspaceLeaf) {
		const view = this.app.workspace.activeLeaf.view;
		if (!view || view.getViewType() !== 'markdown') {
		  return;
		}
	  
		const buttonsDiv = document.createElement('div');
		buttonsDiv.addClass('my-plugin-buttons');
	  
		const button1 = document.createElement('button');
		button1.innerText = 'Socrates';
		button1.addClass('my-plugin-button');
		button1.addEventListener('click', async () => {
			this.settings.prompt = 'Protagoras: {prompt} Socrates:';
			await this.saveSettings();
		});
	  
		buttonsDiv.appendChild(button1);

		const button2 = document.createElement('button');
		button2.innerText = 'Writer';
		button2.addClass('my-plugin-button');
		button2.addEventListener('click', async () => {
			this.settings.prompt = 'For example, when I was first starting out I would often write the following: blockquote{prompt}/blockquote While I think Im still pretty proud of having raised these points at the time, there are some pretty glaringly obvious gaps in my reasoning. In particular, the biggest mistake I made (and would often make) was when I claimed'
			await this.saveSettings();
		});
	  
		buttonsDiv.appendChild(button2);
	  
		// Add more buttons here
	  
		view.containerEl.parentElement.appendChild(buttonsDiv);
	  }



	startPeriodicPopup(interval: number) {
		if (this.intervalId !== null) {
		  // If an interval is already running, stop it first
		  this.stopPeriodicPopup();
		}

		// Schedule the popup to appear at regular intervals
		this.intervalId = window.setInterval(() => {
			this.Notice('This is a periodic popup notification!');
		}, interval);
	  }

	stopPeriodicPopup() {
    	if (this.intervalId !== null) {
      		// Clear the interval if it's running
      		window.clearInterval(this.intervalId);
      		this.intervalId = null;
		}
  	}

	onunload() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			const buttonsDiv = leaf.containerEl.querySelector('.my-plugin-buttons');
			if (buttonsDiv) {
			  buttonsDiv.remove();
			}
		  });
	}

// 	showPopup(message: string) {
// 		// Create and display the popup notification
// 		new Notice(message);
// 	  }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async readLastSentence(): Promise<string> {
		// Get the active markdown view
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (activeView) {
		  // Get the content of the active note
		  const noteContent = await this.app.vault.read(activeView.file);

		  // Extract the last sentence
		  const lastSentence = this.getLastSentence(noteContent);

		  // Display the last sentence
		  if (lastSentence) {
			return lastSentence
		  } else {
			new Notice('No sentence found in the active note.');
		  }
		} else {
		  new Notice('No active note found.');
		}
	}

	getLastSentence(text: string): string | null {
		const sentences = text.match(/[^.!?]+[.!?]+/g);
		return sentences ? sentences[sentences.length - 1].trim() : null;
    }

    async sendTextToOpenAI(prompt: string): Promise<string> {
		//take the settings prompt and replace {{prompt}} with the prompt
		const comboprompt = this.settings.prompt.replace('{prompt}', prompt);

		try {
		  const response = await fetch(`${OPENAI_API_BASE}`, {
			method: 'POST',
			headers: {
			  'Content-Type': 'application/json',
			  'Authorization': `Bearer ${OPENAI_API_KEY}`,
			},
			body: JSON.stringify({
			  model: ENGINE_ID,
			  //messages: [{"role": "user", "content": `Ask a question to someone who wrote: ${prompt}`}],
			  messages: [{"role": "user", "content": comboprompt}],
			}),
		  });
		  if (!response.ok) {
			new Notice(`BAD RESPONSE`)
			throw new Error('Network response was not ok');
		  }

		  const data = await response.json();

		  return `${data.choices[0].message.content.trim()}`;
		} catch (error) {
		  console.error('Error sending text to OpenAI:', error);
		  return 'Error';
		}
	  }

}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Option 1')
			.setDesc('This is option 1')
			.addButton(button => button
				.setButtonText('Click me')
				.onClick(async () => {
				this.plugin.settings.mySetting = 'Option 1 value';
				await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Option 2')
			.setDesc('This is option 1')
			.addButton(button => button
				.setButtonText('Click me')
				.onClick(async () => {
				this.plugin.settings.mySetting = 'Option 1 value';
				await this.plugin.saveSettings();
				}));
	}
}

