import fs from 'fs';
import path from 'path';

// This function reads a file and returns its content as a binary string at runtime.
export const getTemplateContent = (fileName: string): string | null => {
    try {
        const filePath = path.join(process.cwd(), 'public', 'templates', fileName);
        console.log('Resolved template path at runtime:', filePath);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'binary');
        }
        console.warn(`Template file not found at runtime: ${filePath}`);
        return null;
    } catch (error) {
        console.error(`Error reading template file ${fileName} at runtime:`, error);
        return null;
    }
};
