'use client';

import { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, ShieldCheck, Crown, Mail, Clock, Loader2, Trash2, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { cn, formatRelativeTime } from '@/lib/utils';

interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: 'owner' | 'admin' | 'member';
  avatar_url: string | null;
  created_at: string;
  last_login: string | null;
  is_active: boolean;
}

const ROLE_CONFIG = {
  owner: { label: 'Owner', icon: Crown, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  admin: { label: 'Admin', icon: ShieldCheck, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  member: { label: 'Member', icon: Shield, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
};

export default function TeamPage() {
  const { user, teamMember: currentMember } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isOwnerOrAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) console.error('Failed to load team:', error);
    setMembers(data || []);
    setLoading(false);
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !inviteName.trim() || !invitePassword.trim()) {
      setMessage({ type: 'error', text: 'Please fill in all fields' });
      return;
    }
    if (invitePassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    setInviting(true);
    setMessage(null);

    try {
      // Create the user account via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: inviteEmail.trim(),
        password: invitePassword,
        options: { data: { full_name: inviteName.trim() } },
      });

      if (authError) {
        setMessage({ type: 'error', text: authError.message });
        setInviting(false);
        return;
      }

      // Create team member record
      if (authData.user) {
        const { error: memberError } = await supabase.from('team_members').insert({
          user_id: authData.user.id,
          email: inviteEmail.trim(),
          full_name: inviteName.trim(),
          role: inviteRole,
          is_active: true,
        });

        if (memberError) {
          console.error('Member record error:', memberError);
          setMessage({ type: 'error', text: 'Account created but failed to add to team: ' + memberError.message });
        } else {
          setMessage({ type: 'success', text: `${inviteName} has been added to the team!` });
          setInviteEmail('');
          setInviteName('');
          setInvitePassword('');
          setShowInvite(false);
          loadMembers();
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Invite failed' });
    }
    setInviting(false);
  };

  const updateRole = async (memberId: string, newRole: 'admin' | 'member') => {
    const { error } = await supabase.from('team_members').update({ role: newRole }).eq('id', memberId);
    if (error) {
      setMessage({ type: 'error', text: 'Failed to update role' });
    } else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      setMessage({ type: 'success', text: 'Role updated' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const toggleActive = async (memberId: string, isActive: boolean) => {
    const { error } = await supabase.from('team_members').update({ is_active: !isActive }).eq('id', memberId);
    if (error) {
      setMessage({ type: 'error', text: 'Failed to update status' });
    } else {
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_active: !isActive } : m));
    }
  };

  const removeMember = async (member: TeamMember) => {
    if (member.role === 'owner') { alert('Cannot remove the owner.'); return; }
    if (!confirm(`Remove ${member.full_name || member.email} from the team? Their login will be deactivated.`)) return;
    await supabase.from('team_members').update({ is_active: false }).eq('id', member.id);
    loadMembers();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white flex items-center gap-3">
            <Users className="w-6 h-6 text-prospex-cyan" />
            Team
          </h1>
          <p className="text-sm text-prospex-muted mt-1">Manage your team members and their access.</p>
        </div>
        {isOwnerOrAdmin && (
          <button onClick={() => setShowInvite(!showInvite)} className="btn-primary text-sm flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Add Member
          </button>
        )}
      </div>

      {/* Messages */}
      {message && (
        <div className={cn('p-3 rounded-lg flex items-center gap-2', message.type === 'success' ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20')}>
          {message.type === 'success' ? <Check className="w-4 h-4 text-green-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
          <p className={cn('text-sm', message.type === 'success' ? 'text-green-400' : 'text-red-400')}>{message.text}</p>
        </div>
      )}

      {/* Invite Form */}
      {showInvite && isOwnerOrAdmin && (
        <div className="bg-prospex-surface border border-prospex-cyan/20 rounded-xl p-5">
          <h2 className="text-sm font-mono font-semibold text-white mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-prospex-cyan" />
            Add New Team Member
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-prospex-dim uppercase mb-1">Full Name</label>
              <input
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="John Smith"
                className="w-full px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-dim focus:outline-none focus:border-prospex-cyan"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-prospex-dim uppercase mb-1">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="john@company.com"
                className="w-full px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-dim focus:outline-none focus:border-prospex-cyan"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-prospex-dim uppercase mb-1">Temporary Password</label>
              <input
                type="text"
                value={invitePassword}
                onChange={e => setInvitePassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-dim focus:outline-none focus:border-prospex-cyan"
              />
              <p className="text-[10px] text-prospex-dim mt-1">They can change this after first login.</p>
            </div>
            <div>
              <label className="block text-xs font-mono text-prospex-dim uppercase mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'admin' | 'member')}
                className="w-full px-3 py-2 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white focus:outline-none focus:border-prospex-cyan"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={inviteMember} disabled={inviting} className="btn-primary text-sm flex items-center gap-2">
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {inviting ? 'Creating...' : 'Create Account'}
            </button>
            <button onClick={() => setShowInvite(false)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Team Members List */}
      <div className="bg-prospex-surface border border-prospex-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-prospex-border">
          <h2 className="text-sm font-mono font-semibold text-white">
            Team Members ({members.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 text-prospex-cyan animate-spin mx-auto mb-2" />
            <p className="text-xs text-prospex-muted">Loading team...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-prospex-dim mx-auto mb-2" />
            <p className="text-sm text-prospex-muted">No team members yet. Add your first member above.</p>
          </div>
        ) : (
          <div className="divide-y divide-prospex-border/50">
            {members.map(member => {
              const roleConfig = ROLE_CONFIG[member.role];
              const RoleIcon = roleConfig.icon;
              const isCurrentUser = user?.id === member.user_id;

              return (
                <div key={member.id} className={cn('flex items-center justify-between p-4 hover:bg-prospex-bg/30 transition-colors', !member.is_active && 'opacity-40')}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-prospex-cyan/10 border border-prospex-cyan/20 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-prospex-cyan">
                        {(member.full_name || member.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white truncate">
                          {member.full_name || member.email.split('@')[0]}
                        </p>
                        {isCurrentUser && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-prospex-cyan/10 text-prospex-cyan border border-prospex-cyan/20">You</span>
                        )}
                        {!member.is_active && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Mail className="w-3 h-3 text-prospex-dim" />
                        <span className="text-[10px] text-prospex-muted">{member.email}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border', roleConfig.color)}>
                          <RoleIcon className="w-2.5 h-2.5" /> {roleConfig.label}
                        </span>
                        {member.last_login && (
                          <span className="text-[10px] text-prospex-dim flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> Last login {formatRelativeTime(member.last_login)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {isOwnerOrAdmin && !isCurrentUser && member.role !== 'owner' && (
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <select
                        value={member.role}
                        onChange={e => updateRole(member.id, e.target.value as 'admin' | 'member')}
                        className="text-[10px] bg-prospex-bg border border-prospex-border rounded px-2 py-1 text-white focus:outline-none focus:border-prospex-cyan"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => toggleActive(member.id, member.is_active)}
                        className={cn('text-[10px] px-2 py-1 rounded transition-colors', member.is_active ? 'text-amber-400 hover:bg-amber-500/10' : 'text-green-400 hover:bg-green-500/10')}
                      >
                        {member.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => removeMember(member)}
                        className="p-1 text-prospex-dim hover:text-red-400 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Roles explanation */}
      <div className="bg-prospex-surface border border-prospex-border rounded-xl p-5">
        <h3 className="text-xs font-mono font-semibold text-prospex-dim uppercase mb-3">Role Permissions</h3>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(ROLE_CONFIG).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <div key={key} className="text-center">
                <Icon className={cn('w-5 h-5 mx-auto mb-1', config.color.split(' ')[0])} />
                <p className="text-xs font-semibold text-white">{config.label}</p>
                <p className="text-[10px] text-prospex-muted mt-1">
                  {key === 'owner' && 'Full access. Can manage team, billing, and all settings.'}
                  {key === 'admin' && 'Can add/remove members, manage leads, and run scrapes.'}
                  {key === 'member' && 'Can view leads, run scrapes, and use all tools.'}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
