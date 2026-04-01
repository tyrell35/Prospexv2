import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role key for admin operations (inviting users)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'list_members':
        return listMembers();
      case 'invite_member':
        return inviteMember(body);
      case 'update_role':
        return updateRole(body);
      case 'remove_member':
        return removeMember(body);
      case 'resend_invite':
        return resendInvite(body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Team API error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ═══ LIST TEAM MEMBERS ═══
async function listMembers() {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return NextResponse.json({ success: true, members: data || [] });
}

// ═══ INVITE NEW MEMBER ═══
async function inviteMember(body: Record<string, unknown>) {
  const { email, full_name, role = 'member' } = body;

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY not configured. Add it to Vercel Environment Variables to enable team invites.',
    }, { status: 500 });
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('email', (email as string).toLowerCase())
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'This person is already a team member' }, { status: 400 });
  }

  // Invite via Supabase Auth (sends magic link email)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    (email as string).toLowerCase(),
    {
      data: {
        full_name: full_name || '',
        role: role || 'member',
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://prospexv2.vercel.app'}/auth/callback`,
    }
  );

  if (authError) {
    // If user already exists in auth but not in team_members, add them
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      // Find the existing auth user
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = users?.users?.find(u => u.email === (email as string).toLowerCase());

      if (existingUser) {
        // Add to team_members
        const { error: insertError } = await supabase.from('team_members').insert({
          user_id: existingUser.id,
          email: (email as string).toLowerCase(),
          full_name: (full_name as string) || existingUser.user_metadata?.full_name || '',
          role: (role as string) || 'member',
          is_active: true,
        });

        if (insertError) throw new Error(insertError.message);
        return NextResponse.json({ success: true, message: 'Existing user added to team' });
      }
    }
    throw new Error(`Invite failed: ${authError.message}`);
  }

  // Add to team_members table
  const { error: insertError } = await supabase.from('team_members').insert({
    user_id: authData?.user?.id || null,
    email: (email as string).toLowerCase(),
    full_name: (full_name as string) || '',
    role: (role as string) || 'member',
    is_active: true,
  });

  if (insertError) throw new Error(insertError.message);

  return NextResponse.json({
    success: true,
    message: `Invite sent to ${email}. They'll receive an email to set up their account.`,
  });
}

// ═══ UPDATE MEMBER ROLE ═══
async function updateRole(body: Record<string, unknown>) {
  const { member_id, role } = body;
  if (!member_id || !role) return NextResponse.json({ error: 'member_id and role required' }, { status: 400 });

  const validRoles = ['owner', 'admin', 'member'];
  if (!validRoles.includes(role as string)) {
    return NextResponse.json({ error: 'Invalid role. Must be owner, admin, or member' }, { status: 400 });
  }

  const { error } = await supabase
    .from('team_members')
    .update({ role: role as string })
    .eq('id', member_id as string);

  if (error) throw new Error(error.message);
  return NextResponse.json({ success: true });
}

// ═══ REMOVE MEMBER ═══
async function removeMember(body: Record<string, unknown>) {
  const { member_id } = body;
  if (!member_id) return NextResponse.json({ error: 'member_id required' }, { status: 400 });

  // Don't allow removing the owner
  const { data: member } = await supabase
    .from('team_members')
    .select('role')
    .eq('id', member_id as string)
    .single();

  if (member?.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove the account owner' }, { status: 400 });
  }

  // Deactivate instead of delete (preserve audit trail)
  const { error } = await supabase
    .from('team_members')
    .update({ is_active: false })
    .eq('id', member_id as string);

  if (error) throw new Error(error.message);
  return NextResponse.json({ success: true });
}

// ═══ RESEND INVITE ═══
async function resendInvite(body: Record<string, unknown>) {
  const { email } = body;
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  // Send a new magic link
  const { error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: (email as string).toLowerCase(),
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://prospexv2.vercel.app'}/auth/callback`,
    },
  });

  if (error) throw new Error(`Resend failed: ${error.message}`);
  return NextResponse.json({ success: true, message: `New login link sent to ${email}` });
}
