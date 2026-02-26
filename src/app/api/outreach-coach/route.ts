import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ 
        error: { message: 'ANTHROPIC_API_KEY not found. Add it to Vercel Environment Variables (Settings → Environment Variables) and redeploy.' } 
      }, { status: 500 });
    }

    const { system, messages, max_tokens } = await req.json();

    if (!messages || !messages.length) {
      return NextResponse.json({ error: { message: 'No messages provided' } }, { status: 400 });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1500,
        system: system || '',
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `Anthropic API returned ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch {}
      return NextResponse.json({ error: { message: errMsg } }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: { message: err.message || 'Unknown server error' } }, { status: 500 });
  }
}
