import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    if (!ANTHROPIC_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured in environment variables' }, { status: 500 });
    }

    const { system, messages, max_tokens } = await req.json();

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1500,
        system: system || '',
        messages: messages || [],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Anthropic API error: ${res.status} — ${errText}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
