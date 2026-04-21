'use client';

import { useState, useEffect } from 'react';
import {
  Users, UserPlus, Loader2, Shield, Crown, User, Mail, Trash2,
  CheckCircle, AlertTriangle, RefreshCw, Copy, ChevronDown, Settings,
  Clock, MoreVertical, X, Send, Eye, EyeOff,
} from 'lucide-react';

interface TeamMember {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  role: 'owner' | 'admin' | 'member';
  avatar_url: string | null;
  created_at: string;
  last_login: string | null;
  is_active: boolean;
}

const roleConfig: Record<string, { label: string; icon: typeof Crown; color: string; description: string }> = {
  owner: {
    label: 'Owner',
    icon: Crown,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    description: 'Full access. Can manage team, billing, and all settings.',
  },
  admin: {
    label: 'Admin',
    icon: Shield,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    description: 'Can manage leads, campaigns, conversations, and invite members.',
  },
  member: {
    label: 'Member',
    icon: User,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    description: 'Can view and work leads, send outreach, and use AI tools.',
  },
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('member');
  const [inviting, setInviting] = useState(false);

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const loadMembers = async () => {
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_members' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMembers(data.members || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite_member',
          email: inviteEmail.trim(),
          full_name: inviteName.trim(),
          role: inviteRole,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess(data.message || `Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('member');
      setShowInvite(false);
      loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  const updateRole = async (memberId: string, newRole: string) => {
    setActionLoading(memberId);
    setError(null);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_role', member_id: memberId, role: newRole }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess('Role updated');
      loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Role update failed');
    } finally {
      setActionLoading(null);
    }
  };

  const removeMember = async (memberId: string) => {
    setActionLoading(memberId);
    setError(null);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_member', member_id: memberId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess('Team member removed');
      setConfirmRemove(null);
      loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setActionLoading(null);
    }
  };

  const resendInvite = async (email: string) => {
    setActionLoading(email);
    setError(null);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend_invite', email }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuccess(data.message || `Invite resent to ${email}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Resend failed');
    } finally {
      setActionLoading(null);
    }
  };

  const timeAgo = (date: string | null) => {
    if (!date) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const activeMembers = members.filter(m => m.is_active);
  const inactiveMembers = members.filter(m => !m.is_active);

  const getInitials = (name: string, email: string) => {
    if (name && name.trim()) {
      return name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-prospex-cyan" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Users className="w-7 h-7 text-prospex-cyan" />
            Team Management
          </h1>
          <p className="text-sm text-prospex-dim mt-1">
            {activeMembers.length} active member{activeMembers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowInvite(!showInvite)} className="btn-primary text-sm px-4 py-2">
          <UserPlus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-400">{error}</p>
            {error.includes('SERVICE_ROLE_KEY') && (
              <p className="text-xs text-red-300 mt-1">
                Go to Supabase → Settings → API → Copy the service_role key → Add to Vercel Environment Variables as SUPABASE_SERVICE_ROLE_KEY → Redeploy
              </p>
            )}
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <div className="card p-5 border-prospex-cyan/30">
          <h3 className="text-sm font-mono font-semibold text-prospex-cyan mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Invite New Team Member
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Email *</label>
              <input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="team@example.com"
                type="email"
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Full Name</label>
              <input
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="John Smith"
                className="input w-full"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-prospex-dim uppercase block mb-1">Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="input w-full">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          {/* Role Descriptions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            {Object.entries(roleConfig).filter(([k]) => k !== 'owner').map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className={`p-2 rounded-lg border ${inviteRole === key ? cfg.color : 'border-prospex-border/20 opacity-50'} transition-all cursor-pointer`}
                  onClick={() => setInviteRole(key)}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3 h-3" />
                    <span className="text-xs font-mono font-semibold">{cfg.label}</span>
                  </div>
                  <p className="text-[10px] text-prospex-dim leading-relaxed">{cfg.description}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button onClick={inviteMember} disabled={inviting || !inviteEmail.trim()} className="btn-primary text-sm px-4 py-2">
              {inviting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending invite...</> : <><Send className="w-4 h-4" /> Send Invite</>}
            </button>
            <button onClick={() => setShowInvite(false)} className="btn-ghost text-sm">Cancel</button>
          </div>

          <p className="text-[10px] text-prospex-dim mt-3">
            They&apos;ll receive an email with a magic link to set up their account and access Prospex.
          </p>
        </div>
      )}

      {/* Team Members List */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-prospex-border/20">
          <h2 className="text-base font-mono font-semibold text-prospex-text flex items-center gap-2">
            <Users className="w-4 h-4 text-prospex-cyan" />
            Active Team ({activeMembers.length})
          </h2>
        </div>

        <div className="divide-y divide-prospex-border/10">
          {activeMembers.map(member => {
            const cfg = roleConfig[member.role] || roleConfig.member;
            const RoleIcon = cfg.icon;
            const isExpanded = expandedMember === member.id;
            const isLoading = actionLoading === member.id || actionLoading === member.email;
            const isOwner = member.role === 'owner';
            const hasLoggedIn = !!member.last_login;

            return (
              <div key={member.id} className="hover:bg-prospex-surface/30 transition-colors">
                <div className="p-4 flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${cfg.color} border`}>
                    {getInitials(member.full_name, member.email)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-prospex-text truncate">
                        {member.full_name || member.email.split('@')[0]}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono flex items-center gap-1 ${cfg.color}`}>
                        <RoleIcon className="w-2.5 h-2.5" /> {cfg.label}
                      </span>
                      {!hasLoggedIn && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                          Pending
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs text-prospex-dim truncate">{member.email}</p>
                      <span className="text-[10px] text-prospex-dim flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {hasLoggedIn ? `Last active ${timeAgo(member.last_login)}` : `Invited ${timeAgo(member.created_at)}`}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-prospex-cyan" />
                    ) : (
                      <>
                        {!hasLoggedIn && !isOwner && (
                          <button
                            onClick={() => resendInvite(member.email)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                            title="Resend invite"
                          >
                            <RefreshCw className="w-3 h-3" /> Resend
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedMember(isExpanded ? null : member.id)}
                          className="p-1.5 rounded-md hover:bg-prospex-surface/50 text-prospex-dim hover:text-prospex-text transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded Actions */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="p-3 bg-prospex-surface/30 rounded-lg space-y-3">
                      {/* Role Changer */}
                      {!isOwner && (
                        <div>
                          <label className="text-xs font-mono text-prospex-dim uppercase block mb-1.5">Change Role</label>
                          <div className="flex gap-2">
                            {(['admin', 'member'] as const).map(role => {
                              const rc = roleConfig[role];
                              const RIcon = rc.icon;
                              const isActive = member.role === role;
                              return (
                                <button key={role} onClick={() => !isActive && updateRole(member.id, role)}
                                  disabled={isActive}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all ${
                                    isActive ? rc.color + ' font-semibold' : 'border-prospex-border/30 text-prospex-dim hover:border-prospex-cyan/30 hover:text-prospex-text'
                                  }`}>
                                  <RIcon className="w-3 h-3" />
                                  {rc.label}
                                  {isActive && <CheckCircle className="w-3 h-3" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Member Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-prospex-dim font-mono">Joined:</span>
                          <span className="text-prospex-text ml-2">{new Date(member.created_at).toLocaleDateString()}</span>
                        </div>
                        <div>
                          <span className="text-prospex-dim font-mono">Last Login:</span>
                          <span className="text-prospex-text ml-2">{member.last_login ? new Date(member.last_login).toLocaleDateString() : 'Never'}</span>
                        </div>
                        <div>
                          <span className="text-prospex-dim font-mono">User ID:</span>
                          <span className="text-prospex-muted ml-2 text-[10px]">{member.user_id?.slice(0, 8) || 'Pending'}...</span>
                        </div>
                      </div>

                      {/* Remove Button */}
                      {!isOwner && (
                        <div className="pt-2 border-t border-prospex-border/20">
                          {confirmRemove === member.id ? (
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-red-400">Remove {member.full_name || member.email} from the team?</p>
                              <button onClick={() => removeMember(member.id)}
                                className="px-3 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md font-medium transition-colors">
                                Confirm
                              </button>
                              <button onClick={() => setConfirmRemove(null)}
                                className="px-3 py-1 text-xs text-prospex-dim hover:text-prospex-text transition-colors">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmRemove(member.id)}
                              className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 transition-colors">
                              <Trash2 className="w-3 h-3" /> Remove from team
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inactive Members */}
      {inactiveMembers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-prospex-border/20">
            <h2 className="text-sm font-mono font-semibold text-prospex-dim flex items-center gap-2">
              Inactive Members ({inactiveMembers.length})
            </h2>
          </div>
          <div className="divide-y divide-prospex-border/10">
            {inactiveMembers.map(member => (
              <div key={member.id} className="p-4 flex items-center gap-4 opacity-50">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-prospex-surface border border-prospex-border/20 text-prospex-dim">
                  {getInitials(member.full_name, member.email)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-prospex-dim truncate">{member.full_name || member.email.split('@')[0]}</p>
                  <p className="text-xs text-prospex-dim truncate">{member.email}</p>
                </div>
                <span className="text-[10px] text-prospex-dim font-mono">Removed {timeAgo(member.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roles Guide */}
      <div className="card p-5">
        <h3 className="text-sm font-mono font-semibold text-prospex-text mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-prospex-cyan" /> Role Permissions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-prospex-border/20">
                <th className="text-left py-2 px-3 font-mono text-prospex-dim uppercase">Permission</th>
                <th className="text-center py-2 px-3 font-mono text-prospex-dim uppercase">
                  <div className="flex items-center justify-center gap-1"><Crown className="w-3 h-3 text-amber-400" /> Owner</div>
                </th>
                <th className="text-center py-2 px-3 font-mono text-prospex-dim uppercase">
                  <div className="flex items-center justify-center gap-1"><Shield className="w-3 h-3 text-cyan-400" /> Admin</div>
                </th>
                <th className="text-center py-2 px-3 font-mono text-prospex-dim uppercase">
                  <div className="flex items-center justify-center gap-1"><User className="w-3 h-3 text-purple-400" /> Member</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-prospex-border/10">
              {[
                ['View & search leads', true, true, true],
                ['Scrape & enrich leads', true, true, true],
                ['Send outreach messages', true, true, true],
                ['Use AI conversation engine', true, true, true],
                ['View conversations inbox', true, true, true],
                ['Override AI with human messages', true, true, true],
                ['Run market analysis', true, true, true],
                ['Manage email campaigns', true, true, false],
                ['Configure AI agent', true, true, false],
                ['Invite team members', true, true, false],
                ['Change member roles', true, true, false],
                ['Remove team members', true, true, false],
                ['View team management', true, true, false],
                ['Manage billing & plan', true, false, false],
                ['Delete account', true, false, false],
              ].map(([permission, owner, admin, member], i) => (
                <tr key={i} className="hover:bg-prospex-surface/20">
                  <td className="py-2 px-3 text-prospex-text">{permission as string}</td>
                  <td className="py-2 px-3 text-center">{owner ? <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto" /> : <X className="w-3.5 h-3.5 text-red-400/30 mx-auto" />}</td>
                  <td className="py-2 px-3 text-center">{admin ? <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto" /> : <X className="w-3.5 h-3.5 text-red-400/30 mx-auto" />}</td>
                  <td className="py-2 px-3 text-center">{member ? <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto" /> : <X className="w-3.5 h-3.5 text-red-400/30 mx-auto" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Setup Help */}
      <div className="card p-5 border-prospex-border/30">
        <h3 className="text-sm font-mono font-semibold text-prospex-text mb-2 flex items-center gap-2">
          <Settings className="w-4 h-4 text-prospex-dim" /> Setup Requirements
        </h3>
        <div className="space-y-2 text-xs text-prospex-dim">
          <p>For team invites to work, you need the <span className="text-prospex-cyan font-mono">SUPABASE_SERVICE_ROLE_KEY</span> in your Vercel environment variables:</p>
          <ol className="space-y-1 ml-4">
            <li>1. Go to <span className="text-prospex-text">supabase.com</span> → Your project → Settings → API</li>
            <li>2. Copy the <span className="text-prospex-text">service_role</span> key (under &quot;Project API keys&quot;)</li>
            <li>3. Go to <span className="text-prospex-text">vercel.com</span> → Prospex project → Settings → Environment Variables</li>
            <li>4. Add: Key = <span className="text-prospex-cyan font-mono">SUPABASE_SERVICE_ROLE_KEY</span>, Value = the key you copied</li>
            <li>5. Redeploy the project</li>
          </ol>
          <p className="mt-2">Once configured, invited members will receive a <span className="text-prospex-text">magic link email</span> to set up their account.</p>
        </div>
      </div>
    </div>
  );
}
