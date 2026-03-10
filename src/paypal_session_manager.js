/**
 * PayPalセッション管理モジュール
 * ログイン状態の維持・確認・復元を行う
 */

const fs = require('fs');
const path = require('path');

// セッションデータ保存パス
const SESSION_DIR = path.join(__dirname, '..', '.paypal_sessions');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
const COOKIES_FILE = path.join(SESSION_DIR, 'cookies.json');

// セッションディレクトリの初期化
function initSessionDir() {
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
        console.log('📁 セッションディレクトリを作成しました');
    }
}

/**
 * セッション情報を保存
 * @param {Object} sessionData - セッションデータ
 * @param {Array} cookies - クッキー配列
 */
function saveSession(sessionData, cookies = null) {
    initSessionDir();
    
    const data = {
        ...sessionData,
        savedAt: new Date().toISOString()
        // expiresAt: 無制限（削除）
    };
    
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
    console.log('💾 セッションを保存しました');
    
    if (cookies) {
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
        console.log('🍪 クッキーを保存しました');
    }
}

/**
 * セッション情報を読み込み
 * @returns {Object|null} セッションデータ
 */
function loadSession() {
    try {
        if (!fs.existsSync(SESSION_FILE)) {
            return null;
        }
        
        const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        return data;
    } catch (error) {
        console.error('❌ セッション読み込みエラー:', error.message);
        return null;
    }
}

/**
 * クッキーを読み込み
 * @returns {Array|null} クッキー配列
 */
function loadCookies() {
    try {
        if (!fs.existsSync(COOKIES_FILE)) {
            return null;
        }
        
        return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    } catch (error) {
        console.error('❌ クッキー読み込みエラー:', error.message);
        return null;
    }
}

/**
 * セッションが有効かチェック
 * @returns {Object} チェック結果
 */
function checkSession() {
    const session = loadSession();
    
    if (!session) {
        return {
            isValid: false,
            isLoggedIn: false,
            message: 'セッションが見つかりません',
            details: null
        };
    }
    
    // 有効期限チェックを無効化（無制限）
    // const now = new Date();
    // const expiresAt = new Date(session.expiresAt);
    
    return {
        isValid: true,
        isLoggedIn: session.isLoggedIn || false,
        message: session.isLoggedIn ? 'ログイン済み' : '未ログイン',
        details: {
            savedAt: session.savedAt,
            expiresAt: session.expiresAt || '無制限',
            email: session.email || null
        }
    };
}

/**
 * セッションをクリア
 */
function clearSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            fs.unlinkSync(SESSION_FILE);
        }
        if (fs.existsSync(COOKIES_FILE)) {
            fs.unlinkSync(COOKIES_FILE);
        }
        console.log('🗑️ セッションをクリアしました');
        return true;
    } catch (error) {
        console.error('❌ セッションクリアエラー:', error.message);
        return false;
    }
}

/**
 * ログイン状態を更新
 * @param {boolean} isLoggedIn - ログイン状態
 * @param {string} email - メールアドレス（オプション）
 * @param {Array} cookies - クッキー（オプション）
 */
function updateLoginStatus(isLoggedIn, email = null, cookies = null) {
    const session = loadSession() || {};
    
    const updatedSession = {
        ...session,
        isLoggedIn,
        email: email || session.email,
        lastChecked: new Date().toISOString()
    };
    
    saveSession(updatedSession, cookies);
}

/**
 * セッション統計情報を取得
 * @returns {Object} 統計情報
 */
function getSessionStats() {
    const session = loadSession();
    
    if (!session) {
        return {
            exists: false,
            isLoggedIn: false,
            age: null,
            expiresIn: null
        };
    }
    
    const now = new Date();
    const savedAt = new Date(session.savedAt);
    
    const ageMs = now - savedAt;
    
    return {
        exists: true,
        isLoggedIn: session.isLoggedIn || false,
        email: session.email || null,
        age: {
            days: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
            hours: Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
            minutes: Math.floor((ageMs % (60 * 60 * 1000)) / (60 * 1000))
        },
        expiresIn: null, // 無制限
        savedAt: session.savedAt,
        lastChecked: session.lastChecked || null
    };
}

module.exports = {
    saveSession,
    loadSession,
    loadCookies,
    checkSession,
    clearSession,
    updateLoginStatus,
    getSessionStats,
    SESSION_DIR
};
