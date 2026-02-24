'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

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

interface AuthContextType {
  user: User | null;
  session: Session | null;
  teamMember: TeamMember | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  teamMember: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [teamMember, setTeamMember] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadTeamMember(s.user);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadTeamMember(s.user);
      else {
        setTeamMember(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadTeamMember = async (u: User) => {
    try {
      const { data } = await supabase
        .from('team_members')
        .select('*')
        .eq('user_id', u.id)
        .maybeSingle();

      if (data) {
        setTeamMember(data);
        // Update last_login
        supabase.from('team_members').update({ last_login: new Date().toISOString() }).eq('id', data.id).then(() => {});
      } else {
        // Auto-create team member record for existing auth users
        const { data: newMember } = await supabase.from('team_members').insert({
          user_id: u.id,
          email: u.email || '',
          full_name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Team Member',
          role: 'member',
          last_login: new Date().toISOString(),
          is_active: true,
        }).select().maybeSingle();
        setTeamMember(newMember);
      }
    } catch (err) {
      console.error('Failed to load team member:', err);
    }
    setLoading(false);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: error.message };

    // Create team member record
    if (data.user) {
      // Check if this is the first user (make them owner)
      const { count } = await supabase.from('team_members').select('id', { count: 'exact', head: true });
      const role = (count === 0) ? 'owner' : 'member';

      await supabase.from('team_members').insert({
        user_id: data.user.id,
        email,
        full_name: fullName,
        role,
        last_login: new Date().toISOString(),
        is_active: true,
      });
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setTeamMember(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) return { error: error.message };
    return { error: null };
  };

  return (
    <AuthContext.Provider value={{ user, session, teamMember, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
