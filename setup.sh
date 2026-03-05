#!/bin/bash
# ═══════════════════════════════════════════════════════
# PROSPEX V3.1 — AI Outreach Automation Setup Script
# Run this from your Prospex project root in Cursor terminal
# ═══════════════════════════════════════════════════════

echo "🚀 Setting up Prospex V3.1 — AI Outreach Automation..."

# Create API route folders
mkdir -p src/app/api/sequences
mkdir -p src/app/api/reply-detected
mkdir -p src/app/api/conversations
mkdir -p src/app/api/automations

# Create page folders
mkdir -p src/app/sequences
mkdir -p src/app/conversations
mkdir -p src/app/automations

echo "✅ Folders created"
echo ""
echo "📁 Now do ONE of the following:"
echo ""
echo "OPTION A — Drag & drop from the downloaded folder:"
echo "  Copy the files from the prospex-v31/ folder into your project."
echo "  The folder structure already matches your Next.js project."
echo ""
echo "OPTION B — Paste files manually in Cursor:"
echo "  1. Open src/app/api/sequences/route.ts → paste sequences-route.ts"
echo "  2. Open src/app/api/reply-detected/route.ts → paste reply-detection-route.ts"
echo "  3. Open src/app/api/conversations/route.ts → paste conversations-route.ts"
echo "  4. Open src/app/api/automations/route.ts → paste automations-route.ts"
echo "  5. Open src/app/sequences/page.tsx → paste sequences-page.tsx"
echo "  6. Open src/app/conversations/page.tsx → paste conversations-page.tsx"
echo "  7. Open src/app/automations/page.tsx → paste automations-page.tsx"
echo ""
echo "THEN:"
echo "  8. Go to Supabase → SQL Editor → paste supabase-outreach-automation.sql → Run"
echo "  9. Update your Sidebar.tsx with the 3 new nav items (see below)"
echo "  10. git add . && git commit -m 'Add V3.1 outreach automation' && git push"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "SIDEBAR UPDATE — Add these to your Sidebar.tsx nav array:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo '  { href: "/sequences", label: "Sequences", icon: Zap },'
echo '  { href: "/conversations", label: "Conversations", icon: MessageSquare },'
echo '  { href: "/automations", label: "Automations", icon: Settings },'
echo ""
echo "(Import Zap, MessageSquare, Settings from lucide-react)"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "GHL WEBHOOK SETUP:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "GHL → Settings → Webhooks → Add Webhook"
echo "URL: https://YOUR-PROSPEX-URL.vercel.app/api/reply-detected"
echo "Events: InboundMessage, ContactReply"
echo ""
echo "Done! Deploy with: vercel --prod (or push to GitHub)"
