import { App, requestUrl, TFile } from 'obsidian';
import { OpenAIApi, ChatCompletionRequestMessage } from "openai";


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
}


export async function getEmbedding(text: string, openai: OpenAIApi): Promise<number[]> {
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