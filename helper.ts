// helper.ts

import { App, requestUrl, TFile } from 'obsidian';
import { OpenAIApi, ChatCompletionRequestMessage } from "openai";
import { getEncoding, encodingForModel } from "js-tiktoken";

export const TOKEN_LIMIT = 8191;

export const PINECONE_CONSTANTS = {
    URL: 'https://alignment-search-14c0337.svc.us-east1-gcp.pinecone.io/query',
    NAMESPACE: 'alignment-search'
};

export const DEFAULT_SETTINGS: CyborgDuckSettings = {
    pineconeApiKey: '',
    openaiApiKey: '',
    contextAmount: 'whole',
    topK: 5,
    openaiEngineId: 'gpt-4',
    prompt: '',
}


export interface Metadata {
    author: string;
    date: string;
    tags: string;
    text: string;
    title: string;
    url: string;
}

export interface Match {
    id: string;
    metadata: Metadata;
    score: number;
    values: number[];
}

export interface Entry {
    Name: string;
    Author: string;
    Description: string;
    Image: string;
    "Model name": string;
    "Model type": string;
    "Origin (Tweet / Reddit / Post / ...)": string;
    Prompt: string | any[];//ChatCompletionRequestMessage[];
    Tags: string;
}

export interface PineconeOutput {
    results: number[];
    matches: Match[];
    namespace: string;
}

export interface CyborgDuckSettings {
    pineconeApiKey: string;
    openaiApiKey: string;
    contextAmount: 'whole' | '3-paragraphs' | '3-sentences' | '1-sentence';
    topK: number;
    openaiEngineId: string;
    promptLibraryPath?: string;
    prompt: string;
}

export function getPromptByName(name: string, data: Entry[]): string | undefined {
    let entry = data.find(entry => entry.Name === name);
    return entry?.Prompt;
}

// List of models:
// "text-davinci-003" | "text-davinci-002" | "text-davinci-001" | "text-curie-001" | "text-babbage-001" | "text-ada-001" | "davinci" | "curie" | "babbage" | "ada" | "code-davinci-002" | "code-davinci-001" | "code-cushman-002" | "code-cushman-001" | "davinci-codex" | "cushman-codex" | "text-davinci-edit-001" | "code-davinci-edit-001" | "text-embedding-ada-002" | "text-similarity-davinci-001" | "text-similarity-curie-001" | "text-similarity-babbage-001" | "text-similarity-ada-001" | "text-search-davinci-doc-001" | "text-search-curie-doc-001" | "text-search-babbage-doc-001" | "text-search-ada-doc-001" | "code-search-babbage-code-001" | "code-search-ada-code-001" | "gpt2" | "gpt-3.5-turbo" | "gpt-3.5-turbo-0301" | "gpt-4" | "gpt-4-0314" | "gpt-4-32k" | "gpt-4-32k-0314";

// List of valid tiktoken encodings:
// "gpt2" | "r50k_base" | "p50k_base" | "p50k_edit" | "cl100k_base";

export async function getEmbedding(text: string, openai: OpenAIApi): Promise<number[]> {

    // If the text contains more than 4*TOKEN_LIMIT characters, measure the token-length of the text by encoding it
    if (text.length > 4*TOKEN_LIMIT) {
        const enc = getEncoding("cl100k_base");

        let tokens = enc.encode(text);

        // If the token length exceeds the limit, keep only the last TOKEN_LENGTH tokens
        if (tokens.length > TOKEN_LIMIT) {
            tokens = tokens.slice(-TOKEN_LIMIT);
        }

        console.log(`Truncated text to ${tokens.length} tokens.`)

        text = enc.decode(tokens);
    }

    const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: text,
    });
    
    const embedding = response.data.data[0].embedding;
    return embedding;
}

export async function getPinecone(queryEmbedding: number[], apiKey: string, topK: number): Promise<PineconeOutput | Error> {
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

export function formatPineconeOutput(pineconeOutput: PineconeOutput): string {
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

export function formatPineconeSources(pineconeOutput: PineconeOutput): string {
    if (pineconeOutput.matches && pineconeOutput.matches.length > 0) {
        // For each match, create a block
        const blocks = pineconeOutput.matches.map(match => {
            return {
                ...match.metadata,
                text: match.metadata.text,
                oldIndex: match.id
            }
        });

        // Sort blocks by their key and remember their original position
        const sortedBlocks = blocks.sort((a, b) => {
            const keyA = `${a.title}${a.author}${a.date}${a.url}${a.tags}`;
            const keyB = `${b.title}${b.author}${b.date}${b.url}${b.tags}`;
            return keyA.localeCompare(keyB);
        });

        // Combine the text of similar blocks and keep track of the minimum original position
        const combinedBlocks: {block: typeof sortedBlocks[0], minIndex: number}[] = [];
        let currentBlock = sortedBlocks[0];
        let currentMinIndex = parseInt(currentBlock.oldIndex);

        for (let i = 1; i < sortedBlocks.length; i++) {
            const block = sortedBlocks[i];
            const keyA = `${currentBlock.title}${currentBlock.author}${currentBlock.date}${currentBlock.url}${currentBlock.tags}`;
            const keyB = `${block.title}${block.author}${block.date}${block.url}${block.tags}`;

            if (keyA === keyB) {
                // If the blocks are the same, combine their text
                currentBlock.text += '\n.....\n' + block.text;
                currentMinIndex = Math.min(currentMinIndex, parseInt(block.oldIndex));
            } else {
                // If the blocks are different, add the current block to the array and start a new current block
                combinedBlocks.push({block: currentBlock, minIndex: currentMinIndex});
                currentBlock = block;
                currentMinIndex = parseInt(block.oldIndex);
            }
        }

        // Don't forget to add the last block
        combinedBlocks.push({block: currentBlock, minIndex: currentMinIndex});

        // Sort the combined blocks by their minimum original position
        combinedBlocks.sort((a, b) => a.minIndex - b.minIndex);

        // Create the final output
        let output = '';
        for (let i = 0; i < combinedBlocks.length; i++) {
            const { block } = combinedBlocks[i];
            output += `[${String.fromCharCode('a'.charCodeAt(0) + i)}] ${block.title} - ${block.author} - ${block.date}\n${block.text}\n\n`;
        }

        return output;
    }

    return 'No matches found.';
}


export async function createMarkdownFile(app: App, content: string): Promise<TFile> {
    const filename = `Generated-${Date.now()}.md`;
    const file = await app.vault.create(filename, content);
    return file;
}