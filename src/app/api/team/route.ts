import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authOr401, adminOr403 } from '@/lib/api-auth';

// Both admin operations (inviting users via auth.admin) and regular table reads
// run through the service-role client now that RLS requires authenticated.
const supabase = supabaseAdmin;

const ADMIN_ONLY_ACTIONS = new Set(['invite_member', 'update_role', 'remove_member', 'resend_invite']);

export async function POST(request: NextRequest) {
  // Every team action requires a logged-in user.
  const auth = await authOr401();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { action } = body;

    // Destructive / admin actions require the caller to be an owner or admin.
    if (ADMIN_ONLY_ACTIONS.has(action)) {
      const adminCheck = await adminOr403(auth);
      if (adminCheck instanceof NextResponse) return adminCheck;
    }

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

  const emailLower = (email as string).toLowerCase().trim();

  // Check if already a team member
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('email', emailLower)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'This person is already a team member' }, { status: 400 });
  }

  // Try to invite via Supabase Auth
  let userId: string | null = null;

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      emailLower,
      {
        data: {
          full_name: full_name || '',
          role: role || 'member',
        },
      }
    );

    if (authError) {
      // User might already exist in auth but not in team_members
      if (authError.message?.includes('already') || authError.message?.includes('exists')) {
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
        const found = usersData?.users?.find((u: { email?: string }) => u.email === emailLower);
        userId = found?.id || null;
      } else {
        throw new Error(authError.message || 'Auth invite failed');
      }
    } else {
      userId = authData?.user?.id || null;
    }
  } catch (err: unknown) {
    // If invite fails, still try to look up existing auth user
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const found = usersData?.users?.find((u: { email?: string }) => u.email === emailLower);
      userId = found?.id || null;
      if (!userId) {
        const message = err instanceof Error ? err.message : 'Invite failed';
        throw new Error(message);
      }
    } catch (innerErr: unknown) {
      const message = innerErr instanceof Error ? innerErr.message : 'Invite failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Add to team_members table
  try {
    const { error: insertError } = await supabase.from('team_members').insert({
      user_id: userId,
      email: emailLower,
      full_name: (full_name as string) || '',
      role: (role as string) || 'member',
      is_active: true,
    });

    if (insertError) throw new Error(insertError.message);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add team member';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `Invite sent to ${emailLower}. They'll receive an email to set up their account.`,
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
