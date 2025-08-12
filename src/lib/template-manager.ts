
import fs from 'fs';
import path from 'path';

// This function reads a file and returns its content as a binary string.
// It's designed to be called at the top level of a module, so that Next.js
// bundles the file content during the build process.
const readTemplate = (fileName: string): string | null => {
    try {
        const filePath = path.join(process.cwd(), 'public', 'templates', fileName);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'binary');
        }
        console.warn(`Template file not found at build time: ${filePath}`);
        return null;
    } catch (error) {
        console.error(`Error reading template file ${fileName} at build time:`, error);
        return null;
    }
};

// Read all templates at build time and store them in memory.
const bookChapterTemplate = readTemplate('INCENTIVE_BOOK_CHAPTER.docx');
const bookPublicationTemplate = readTemplate('INCENTIVE_BOOK_PUBLICATION.docx');

// A map to easily access the templates by name.
const templates = new Map<string, string | null>([
    ['INCENTIVE_BOOK_CHAPTER.docx', bookChapterTemplate],
    ['INCENTIVE_BOOK_PUBLICATION.docx', bookPublicationTemplate],
]);

// This function is called by server actions at runtime to get the pre-loaded template content.
export const getTemplateContent = (templateName: string): string | null => {
    return templates.get(templateName) || null;
};
