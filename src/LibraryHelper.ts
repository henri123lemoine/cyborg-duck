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