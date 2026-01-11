/* storage.js
   Fixed Supabase-backed storage adapter with proper error handling
*/

/* -------------------- CONFIG -------------------- */
const SUPABASE_URL = 'https://ucsivolvttpqmqgoutfa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjc2l2b2x2dHRwcW1xZ291dGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY1ODk3NjUsImV4cCI6MjA1MjE2NTc2NX0.R8_4yniRc1EytX9rQV9QfFquTEdgPDMhy-GXhPIFqRc';

/* -------------------- KEYS (localStorage) -------------------- */
const KEY_USERS = 'dl_users_v1_explicit';
const KEY_LEVELS = 'dl_levels_v1_explicit';
const KEY_SUBS = 'dl_subs_v1_explicit';
const KEY_AUDIT = 'dl_audit_v1';
const KEY_SESSION = 'dl_session_v1_explicit';

/* -------------------- Database Table Structure Reference --------------------
   Create these tables in your Supabase project:
   
   1. users table:
      id (text, primary key)
      username (text)
      password (text)
      role (text)
      nationality (text)
      points (integer)
      created_at (bigint)
      profile_pic (text)
      show_country (boolean)
      bio (text)
      completed_records (jsonb)
      equipped_title (text)
      updated_at (timestamp with time zone)
   
   2. levels table:
      id (text, primary key)
      name (text)
      creator (text)
      youtube_url (text)
      difficulty (text)
      points (integer)
      placement (integer)
      verified (boolean)
      created_at (bigint)
      updated_at (timestamp with time zone)
   
   3. submissions table:
      id (text, primary key)
      level_id (text)
      player_id (text)
      video_url (text)
      status (text) // pending, approved, rejected
      created_at (bigint)
      updated_at (timestamp with time zone)
   
   4. audit_log table:
      id (text, primary key)
      user_id (text)
      action (text)
      target_type (text)
      target_id (text)
      details (jsonb)
      created_at (bigint)
*/

/* -------------------- Improved Utilities -------------------- */
function _readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return JSON.parse(JSON.stringify(fallback || []));
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : JSON.parse(JSON.stringify(fallback || []));
  } catch(e) {
    console.warn('storage: readLocal parse error', key, e);
    return JSON.parse(JSON.stringify(fallback || []));
  }
}

function _writeLocal(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val || []));
  } catch(e) {
    console.warn('storage: writeLocal error', key, e);
  }
}

function uid() {
  return 'id_' + Math.random().toString(36).substr(2, 9);
}

function now() {
  return Date.now();
}

/* -------------------- Enhanced Supabase Client -------------------- */
class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url;
    this.anonKey = anonKey;
  }

  async query(table, method = 'GET', body = null, params = {}) {
    try {
      // Build URL with query parameters
      let url = `${this.url}/rest/v1/${table}`;
      
      if (params.select) {
        url += `?select=${encodeURIComponent(params.select)}`;
      } else if (Object.keys(params).length > 0) {
        const queryParams = new URLSearchParams(params).toString();
        url += `?${queryParams}`;
      }

      const headers = {
        'apikey': this.anonKey,
        'Authorization': `Bearer ${this.anonKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Prefer': 'return=representation'
      };

      const options = {
        method,
        headers,
        mode: 'cors'
      };

      if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }

      console.log(`Supabase ${method} to ${table}`, { url, options });
      
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Supabase error (${response.status}):`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // For DELETE or empty responses
      if (response.status === 204 || method === 'DELETE') {
        return [];
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Supabase query failed for ${table}:`, error);
      throw error;
    }
  }

  async fetchAll(table) {
    return this.query(table, 'GET', null, { select: '*' });
  }

  async upsert(table, data) {
    // Ensure data is an array
    const dataArray = Array.isArray(data) ? data : [data];
    
    // Add updated_at timestamp
    const dataWithTimestamps = dataArray.map(item => ({
      ...item,
      updated_at: new Date().toISOString()
    }));

    return this.query(table, 'POST', dataWithTimestamps, {
      on_conflict: 'id',
      select: '*'
    });
  }

  async insert(table, data) {
    const dataArray = Array.isArray(data) ? data : [data];
    return this.query(table, 'POST', dataArray);
  }

  async update(table, id, data) {
    return this.query(table, 'PATCH', data, {
      id: `eq.${id}`
    });
  }

  async delete(table, id) {
    return this.query(table, 'DELETE', null, {
      id: `eq.${id}`
    });
  }
}

// Create Supabase client instance
const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -------------------- Improved Sync Routines -------------------- */
async function syncFromRemote() {
  console.log('Syncing from remote...');
  
  try {
    // Fetch all tables in parallel
    const [remoteUsers, remoteLevels, remoteSubs, remoteAudit] = await Promise.allSettled([
      supabase.fetchAll('users').catch(() => []),
      supabase.fetchAll('levels').catch(() => []),
      supabase.fetchAll('submissions').catch(() => []),
      supabase.fetchAll('audit_log').catch(() => [])
    ]);

    // Update local storage with remote data
    if (remoteUsers.status === 'fulfilled') {
      _writeLocal(KEY_USERS, remoteUsers.value || []);
    }
    if (remoteLevels.status === 'fulfilled') {
      _writeLocal(KEY_LEVELS, remoteLevels.value || []);
    }
    if (remoteSubs.status === 'fulfilled') {
      _writeLocal(KEY_SUBS, remoteSubs.value || []);
    }
    if (remoteAudit.status === 'fulfilled') {
      _writeLocal(KEY_AUDIT, remoteAudit.value || []);
    }

    console.log('Sync from remote completed');
    return true;
  } catch (error) {
    console.error('Failed to sync from remote:', error);
    return false;
  }
}

async function syncToRemote(tableKey, tableName) {
  try {
    const localData = _readLocal(tableKey, []);
    
    if (!Array.isArray(localData) || localData.length === 0) {
      return true; // Nothing to sync
    }

    console.log(`Syncing ${tableName} to remote...`, localData.length, 'items');
    
    // For initial sync, we might want to insert all records
    const result = await supabase.upsert(tableName, localData);
    console.log(`Synced ${tableName}:`, result);
    
    return true;
  } catch (error) {
    console.error(`Failed to sync ${tableName}:`, error);
    return false;
  }
}

/* -------------------- Public API -------------------- */
function getUsers() { 
  const users = _readLocal(KEY_USERS, []);
  console.log('getUsers:', users.length, 'users');
  return users;
}

function saveUsers(users) {
  console.log('saveUsers:', users.length, 'users');
  _writeLocal(KEY_USERS, users || []);
  
  // Sync to Supabase in background
  setTimeout(() => {
    syncToRemote(KEY_USERS, 'users').catch(console.error);
  }, 0);
  
  return true;
}

function getLevels() { 
  const levels = _readLocal(KEY_LEVELS, []);
  console.log('getLevels:', levels.length, 'levels');
  return levels;
}

function saveLevels(levels) {
  console.log('saveLevels:', levels.length, 'levels');
  _writeLocal(KEY_LEVELS, levels || []);
  
  setTimeout(() => {
    syncToRemote(KEY_LEVELS, 'levels').catch(console.error);
  }, 0);
  
  return true;
}

function getSubs() { 
  const subs = _readLocal(KEY_SUBS, []);
  console.log('getSubs:', subs.length, 'submissions');
  return subs;
}

function saveSubs(subs) {
  console.log('saveSubs:', subs.length, 'submissions');
  _writeLocal(KEY_SUBS, subs || []);
  
  setTimeout(() => {
    syncToRemote(KEY_SUBS, 'submissions').catch(console.error);
  }, 0);
  
  return true;
}

function getAudit() { 
  const audit = _readLocal(KEY_AUDIT, []);
  console.log('getAudit:', audit.length, 'audit entries');
  return audit;
}

function saveAudit(audit) {
  console.log('saveAudit:', audit.length, 'audit entries');
  _writeLocal(KEY_AUDIT, audit || []);
  
  setTimeout(() => {
    syncToRemote(KEY_AUDIT, 'audit_log').catch(console.error);
  }, 0);
  
  return true;
}

/* -------------------- Session Management -------------------- */
function setSession(sessionData) {
  try {
    // Add timestamp to session
    const sessionWithTimestamp = {
      ...sessionData,
      created_at: now(),
      last_active: now()
    };
    localStorage.setItem(KEY_SESSION, JSON.stringify(sessionWithTimestamp));
    
    // Also sync to users table if we have a user
    if (sessionData.userId) {
      const users = getUsers();
      const userIndex = users.findIndex(u => u.id === sessionData.userId);
      
      if (userIndex > -1) {
        users[userIndex] = {
          ...users[userIndex],
          last_login: now()
        };
        saveUsers(users);
      }
    }
    
    return true;
  } catch (error) {
    console.error('setSession error:', error);
    return false;
  }
}

function getSession() {
  try {
    const sessionRaw = localStorage.getItem(KEY_SESSION);
    if (!sessionRaw) return null;
    
    const session = JSON.parse(sessionRaw);
    
    // Check if session is expired (24 hours)
    const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
    if (now() - session.last_active > SESSION_TIMEOUT) {
      clearSession();
      return null;
    }
    
    // Update last active time
    session.last_active = now();
    localStorage.setItem(KEY_SESSION, JSON.stringify(session));
    
    return session;
  } catch (error) {
    console.error('getSession error:', error);
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(KEY_SESSION);
    
    // Log logout in audit
    const session = getSession();
    if (session && session.userId) {
      const auditLog = getAudit();
      auditLog.push({
        id: uid(),
        user_id: session.userId,
        action: 'logout',
        details: { timestamp: now() },
        created_at: now()
      });
      saveAudit(auditLog);
    }
    
    return true;
  } catch (error) {
    console.error('clearSession error:', error);
    return false;
  }
}

/* -------------------- Enhanced Seeder -------------------- */
async function initializeDatabase() {
  console.log('Initializing database...');
  
  // Check if we have any data
  const users = getUsers();
  const levels = getLevels();
  
  if (users.length === 0) {
    console.log('No users found, seeding initial data...');
    
    // Create head admin
    const headAdmin = {
      id: 'user_' + uid(),
      username: 'zmmieh.',
      password: '123456',
      role: 'headadmin',
      nationality: 'Hungary',
      points: 1000,
      created_at: now(),
      profile_pic: '',
      show_country: true,
      bio: 'Head Administrator',
      completed_records: [],
      equipped_title: 'Admin',
      is_active: true,
      permissions: ['all']
    };
    
    saveUsers([headAdmin]);
    
    // Create sample levels if none exist
    if (levels.length === 0) {
      const sampleLevels = [
        {
          id: 'level_' + uid(),
          name: 'Bloodbath',
          creator: 'Riot',
          youtube_url: 'https://www.youtube.com/watch?v=JecDJ6b81JM',
          difficulty: 'Extreme Demon',
          points: 500,
          placement: 1,
          verified: true,
          created_at: now(),
          verification_video: '',
          notes: 'The original hardest demon'
        },
        {
          id: 'level_' + uid(),
          name: 'Sonic Wave',
          creator: 'Cyclic',
          youtube_url: 'https://www.youtube.com/watch?v=VKLsX0u7b8k',
          difficulty: 'Extreme Demon',
          points: 450,
          placement: 2,
          verified: true,
          created_at: now(),
          verification_video: '',
          notes: 'Iconic wave challenge'
        }
      ];
      
      saveLevels(sampleLevels);
    }
    
    // Create initial audit log entry
    saveAudit([{
      id: 'audit_' + uid(),
      user_id: headAdmin.id,
      action: 'system_init',
      target_type: 'system',
      target_id: 'init',
      details: { message: 'Database initialized with seed data' },
      created_at: now()
    }]);
    
    console.log('Database seeded successfully');
  } else {
    console.log('Existing data found:', {
      users: users.length,
      levels: levels.length
    });
  }
}

/* -------------------- Initialization -------------------- */
async function initializeStorage() {
  console.log('=== Storage Initialization Started ===');
  
  try {
    // 1. First try to sync from remote
    console.log('Attempting remote sync...');
    const remoteSynced = await syncFromRemote();
    
    if (!remoteSynced) {
      console.warn('Remote sync failed, using local data only');
    }
    
    // 2. Initialize database with seed data if empty
    await initializeDatabase();
    
    // 3. Start periodic sync (every 2 minutes)
    setInterval(async () => {
      console.log('Running periodic sync...');
      try {
        await syncToRemote(KEY_USERS, 'users');
        await syncToRemote(KEY_LEVELS, 'levels');
        await syncToRemote(KEY_SUBS, 'submissions');
        await syncToRemote(KEY_AUDIT, 'audit_log');
      } catch (syncError) {
        console.error('Periodic sync failed:', syncError);
      }
    }, 120000); // 2 minutes
    
    console.log('=== Storage Initialization Complete ===');
    
    // Dispatch event to notify other scripts
    window.dispatchEvent(new CustomEvent('storage:ready'));
    
  } catch (error) {
    console.error('Storage initialization failed:', error);
    
    // Fallback: just use localStorage
    await initializeDatabase();
  }
}

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStorage);
} else {
  setTimeout(initializeStorage, 100);
}

/* -------------------- Expose to Window -------------------- */
window.getUsers = getUsers;
window.saveUsers = saveUsers;
window.getLevels = getLevels;
window.saveLevels = saveLevels;
window.getSubs = getSubs;
window.saveSubs = saveSubs;
window.getAudit = getAudit;
window.saveAudit = saveAudit;
window.setSession = setSession;
window.getSession = getSession;
window.clearSession = clearSession;
window.uid = uid;
window.now = now;

/* -------------------- Debug Functions -------------------- */
window.storageDebug = async function() {
  console.group('📦 Storage Debug Info');
  
  console.log('📊 Local Storage:');
  console.log('Users:', getUsers());
  console.log('Levels:', getLevels());
  console.log('Submissions:', getSubs());
  console.log('Audit Log:', getAudit());
  console.log('Session:', getSession());
  
  console.log('🌐 Testing Supabase Connection...');
  try {
    const testResult = await supabase.query('users', 'GET', null, { limit: '1' });
    console.log('Supabase test query:', testResult);
  } catch (error) {
    console.error('Supabase connection test failed:', error);
  }
  
  console.groupEnd();
  return true;
};

window.resetStorage = function() {
  if (confirm('This will clear ALL local data. Are you sure?')) {
    localStorage.clear();
    console.log('Storage reset complete. Refreshing...');
    setTimeout(() => window.location.reload(), 1000);
  }
};

window.forceSync = async function() {
  console.log('🔄 Manual sync started...');
  try {
    await syncFromRemote();
    console.log('✅ Sync complete');
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
};