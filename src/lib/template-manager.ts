import fs from 'fs';
import path from 'path';

// This function reads a file and returns its content as a binary string at runtime.
export const getTemplateContent = (fileName: string): string | null => {
    try {
        // Use path.resolve with __dirname to get a reliable path to the templates folder
        // which should be located relative to this file in the compiled output.
        // In Next.js server components/actions, this should correctly locate the files.
        const templatesDir = path.resolve(process.cwd(), 'src', 'templates');
        const filePath = path.join(templatesDir, fileName);
        
        console.log(`Attempting to read template from: ${filePath}`);

        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'binary');
        } else {
            console.warn(`Template file not found at: ${filePath}`);
            // Diagnostic logging
            try {
                const files = fs.readdirSync(templatesDir);
                console.warn(`Files found in templates directory (${templatesDir}):`, files);
            } catch (dirError) {
                console.error(`Error reading templates directory ${templatesDir}:`, dirError);
            }
            return null;
        }
    } catch (error) {
        console.error(`Error reading template file ${fileName}:`, error);
        if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack);
        }
        return null;
    }
};
