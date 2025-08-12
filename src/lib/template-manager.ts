import fs from 'fs';
import path from 'path';

// This function reads a file and returns its content as a binary string at runtime.
export const getTemplateContent = (fileName: string): string | null => {
    try {
        const templatesDir = path.join(process.cwd(), 'public', 'templates');
        const filePath = path.join(templatesDir, fileName);
        console.log('Resolved template path at runtime:', filePath);

        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'binary');
        } else {
            console.warn(`Template file not found at runtime: ${filePath}`);
            // List files in templates directory for diagnostics
            try {
                const files = fs.readdirSync(templatesDir);
                console.warn(`Files in templates directory (${templatesDir}):`, files);
            } catch (dirError) {
                console.error(`Error reading templates directory ${templatesDir}:`, dirError);
            }
            return null;
        }
    } catch (error) {
        console.error(`Error reading template file ${fileName} at runtime:`, error);
        if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack);
        }
        return null;
    }
};
