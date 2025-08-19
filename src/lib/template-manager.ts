
'use server';
import { officeNotingTemplate } from '@/app/document-actions';
import { excelClaimTemplate } from '@/templates/format';
import { membershipTemplate } from '@/templates/INCENTIVE_MEMBERSHIP';
import { bookChapterTemplate } from '@/templates/INCENTIVE_BOOK_CHAPTER';
import { bookPublicationTemplate } from '@/templates/INCENTIVE_BOOK_PUBLICATION';

const templates: Record<string, string> = {
    'IMR_RECOMMENDATION_TEMPLATE.docx': officeNotingTemplate,
    'format.xlsx': excelClaimTemplate,
    'INCENTIVE_MEMBERSHIP.docx': membershipTemplate,
    'INCENTIVE_BOOK_CHAPTER.docx': bookChapterTemplate,
    'INCENTIVE_BOOK_PUBLICATION.docx': bookPublicationTemplate,
};

export async function getTemplateContent(templateName: string): Promise<Buffer | null> {
    const base64Content = templates[templateName];
    if (base64Content) {
        return Buffer.from(base64Content, 'base64');
    }
    console.error(`Template "${templateName}" not found.`);
    return null;
}
