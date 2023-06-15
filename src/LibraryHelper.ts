// LibraryHelper.ts

import { Octokit } from "@octokit/rest";
import * as fs from 'fs/promises';

import { App, Notice } from 'obsidian';
import { CommandManager } from './CommandManager';
import { Prompt } from "./CustomViews";
import CyborgDuckPlugin from './main';

const OWNER = 'henri123lemoine'; // The username of the repository owner
const REPO = 'cyborg-duck'; // The name of the repository
// const BRANCH = 'main'; // The name of the branch to commit to
const BRANCH = 'update-library'; // The name of the branch to commit to
const FILE_PATH = 'prompt-libraries\/prompt-library.json'; // The path to the file in your GitHub repository

export interface Entry {
    Name: string;
    Author?: string;
    Description: string;
    Image?: string;
    "Model name"?: string;
    "Model type": string;
    "Origin (Tweet / Reddit / Post / ...)": string;
    Prompt: string | any[];
    Tags?: string;
}

interface GitHubContentResponse {
    data: {
        content: string;
        sha: string;
    }
}


export class PromptLibraryManager {
    app: App;
    plugin: CyborgDuckPlugin;
    commandManager: CommandManager;
    promptLibraryPath: string;

    constructor(app: App, plugin: CyborgDuckPlugin, commandManager: CommandManager) {
        this.app = app;
        this.plugin = plugin;
        this.commandManager = commandManager;
        this.promptLibraryPath = this.plugin.settings.promptLibraryPath;
    }

    async addPrompt(prompt: Prompt) {
        console.log('Adding entry to library');
        console.log(prompt);
    
        // Convert the Prompt into an Entry
        const entry: Entry = {
            Name: prompt.name,
            Author: prompt.author || '',
            Description: prompt.description,
            "Model type": prompt.modelType,
            Prompt: prompt.promptData,
        } as Entry;
    
        if (prompt.pushToGit) {
            try {
                await this.pushToGithub(entry);
            } catch (error) {
                console.error('Failed to push to GitHub:', error);
            }
        }
    
        return this.addEntryToLocalJson(entry);
    }

    async pushToGithub(entry: Entry) {
        if (!this.plugin.settings.githubPAT) {
            console.error('GitHub Personal Access Token not set. Please set it in the settings and try again.', 5000);
            return;
        }
    
        const octokit = new Octokit({
            auth: this.plugin.settings.githubPAT, 
            userAgent: 'CyborgDuckPlugin',
        });
    
        try {
            // Fetch and update the content
            const updatedContent = await this.fetchAndUpdateContent(octokit, entry);
    
            // Get the sha of the current content
            const currentContent = await octokit.rest.repos.getContent({
                owner: OWNER,
                repo: REPO,
                path: FILE_PATH,
                ref: BRANCH,
            }) as GitHubContentResponse;
            const sha = currentContent.data.sha;
    
            // Push the updated content to GitHub
            const response = await octokit.rest.repos.createOrUpdateFileContents({
                owner: OWNER,
                repo: REPO,
                path: FILE_PATH,
                branch: BRANCH,
                message: `Added prompt ${entry.Name}`,
                content: updatedContent,
                sha: sha,
            });
            console.log('Pushed to GitHub:', response);
    
            // Create a gist with the updated content
            const gistUrl = await this.createGist(octokit, updatedContent);
            console.log('Created gist:', gistUrl);
            
            // Create the issue
            const issueResponse = await octokit.rest.issues.create({
                owner: OWNER,
                repo: REPO,
                title: `[Library] Added prompt ${entry.Name}`,
                body: `A new prompt named \"${entry.Name}\" was added. See the changes in the attached file: ${gistUrl}`,
            });
            
            new Notice(`Successfully created an issue for ${entry.Name}.`);
            console.log('Created issue:', issueResponse);
    
            // Get the issue number from the issue response
            const issueNumber = issueResponse.data.number;
    
            // Create the pull request and link it to the issue
            await octokit.rest.pulls.create({
                owner: OWNER,
                repo: REPO,
                title: `[Library] Added prompt ${entry.Name}`,
                head: BRANCH,
                base: BRANCH,
                body: `A new prompt named \"${entry.Name}\" was added. See the changes in the attached file: ${gistUrl}\n\nFixes #${issueNumber}`, // Use a keyword followed by # and the issue number to link them
            });
            
            new Notice(`Successfully created a pull request for ${entry.Name}.`);
            console.log('Created pull request');
        } catch (error) {
            console.error('Failed to update GitHub:', error);
            new Notice(`Failed to update GitHub: ${error.message}`);
        }
    }
    
    async fetchAndUpdateContent(octokit: Octokit, entry: Entry) {
        // Read the current content of the file from your Github repository
        const currentContent = await octokit.rest.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: FILE_PATH,
            ref: BRANCH,
        }) as GitHubContentResponse;
    
        // Parse the current content of the file
        const currentContentParsed = JSON.parse(decodeBase64(currentContent.data.content));
        console.log('Current content:', currentContentParsed);
    
        // Add the new entry to the content
        currentContentParsed.push(entry);
    
        // Convert the updated content back to base64
        return encodeBase64(JSON.stringify(currentContentParsed, null, 2));
    }

    async fetchAndSaveLibrary() {
        if (!this.plugin.settings.githubPAT) {
            console.error('GitHub Personal Access Token not set. Please set it in the settings and try again.', 5000);
            return;
        }
    
        const octokit = new Octokit({
            auth: this.plugin.settings.githubPAT, 
            userAgent: 'CyborgDuckPlugin',
        });
    
        try {
            // Read the current content of the file from your Github repository
            const currentContent = await octokit.rest.repos.getContent({
                owner: OWNER,
                repo: REPO,
                path: FILE_PATH,
                ref: BRANCH,
            }) as GitHubContentResponse;
            
            // Decode the base64 content
            const content = decodeBase64(currentContent.data.content);
    
            // Define the path to the local file
            console.log('Prompt library path:', this.promptLibraryPath);
            const localFilePath = this.promptLibraryPath.replace(".json", "local.json");
            console.log('Prompt library path:', this.promptLibraryPath);
    
            // Write the content to the local file
            await fs.writeFile(localFilePath, content, 'utf8');
    
            console.log(`Successfully fetched library and saved as ${localFilePath}`);
        } catch (error) {
            console.error('Failed to fetch library:', error);
        }
    }
    
    async createGist(octokit: Octokit, content: string): Promise<string> {
        const gist = await octokit.rest.gists.create({
            files: {
                "updated_prompts.json": {
                    content: content,
                },
            },
        });

        console.log('Created gist:', gist);
        
        return gist.data.html_url || '';
    }

    async addEntryToLocalJson(entry: Entry) {
        let entries: Entry[];
        
        try {
            const data = await fs.readFile(this.promptLibraryPath, 'utf8');
            entries = JSON.parse(data);
        } catch (error) {
            // If the file doesn't exist, start with an empty list
            entries = [];
        }
        
        // Add the new entry to the list
        entries.push(entry);
        
        // Write the updated list back to the file
        await fs.writeFile(this.promptLibraryPath, JSON.stringify(entries, null, 2), 'utf8');
    }
}

function decodeBase64(input: string): string {
    if (typeof Buffer === 'function') {
        // Node.js environment
        return Buffer.from(input, 'base64').toString('utf8');
    } else {
        // Browser environment
        return atob(input);
    }
}

function encodeBase64(input: string): string {
    if (typeof Buffer === 'function') {
        // Node.js environment
        return Buffer.from(input, 'utf8').toString('base64');
    } else {
        // Browser environment
        return btoa(input);
    }
}