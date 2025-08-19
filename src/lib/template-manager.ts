import fs from 'fs';
import path from 'path';

export function getTemplateContent(templateName: string): Buffer | null {
    const templatePath = path.join(process.cwd(), 'src', 'templates', templateName);
    if (fs.existsSync(templatePath)) {
        return fs.readFileSync(templatePath);
    }
    console.error(`Template "${templateName}" not found at path: ${templatePath}`);
    return null;
}
