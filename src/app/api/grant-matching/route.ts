import { NextRequest, NextResponse } from 'next/server';
import { getResearchDomainSuggestion } from '@/ai/flows/research-domain-suggestion';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { facultyProfile } = body;

    if (!facultyProfile) {
      return NextResponse.json({ success: false, error: 'Faculty profile is required.' }, { status: 400 });
    }

    // Call the AI flow to get grant matching suggestions
    const result = await getResearchDomainSuggestion({ paperTitles: facultyProfile.researchInterests || [] });

    if (!result || !result.domain) {
      return NextResponse.json({ success: false, error: 'Failed to get grant matching suggestions.' }, { status: 500 });
    }

    // For demonstration, return the domain as suggested grants (in real case, integrate with grant database)
    return NextResponse.json({ success: true, suggestedGrants: [`Grant related to domain: ${result.domain}`] });
  } catch (error: any) {
    console.error('Error in grant matching API:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
