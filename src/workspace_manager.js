/**
 * Workspace & Menu 管理モジュール
 * JSONファイルベースの永続化
 */

const fs = require('fs');
const path = require('path');
const {
    safeLoadJsonFile,
    writeJsonFileAtomic
} = require('./utils/json-storage');

const DATA_DIR = path.join(__dirname, '..', '.workspace_data');
const WORKSPACE_FILE = path.join(DATA_DIR, 'workspaces.json');
const MENU_FILE = path.join(DATA_DIR, 'menus.json');
const TICKET_FILE = path.join(DATA_DIR, 'tickets.json');
const ACCOUNTS_FILE = path.join(__dirname, '..', '.workspace_accounts.json');

function saveAccounts(config) {
    writeJsonFileAtomic(ACCOUNTS_FILE, config, { ensureDir: false });
}

// アカウント設定読み込み
function loadAccounts() {
    return safeLoadJsonFile(
        ACCOUNTS_FILE,
        { accounts: [], default_account: null },
        {
            label: 'アカウント設定',
            backupCorruptFile: true
        }
    );
}

// アカウント取得
function getAccount(name = null) {
    const config = loadAccounts();
    const accountName = name || config.default_account;
    if (!accountName) return null;
    return config.accounts.find(a => a.name === accountName) || null;
}

// 全アカウント取得
function getAllAccounts() {
    const config = loadAccounts();
    return config.accounts || [];
}

// アカウント追加
function addAccount(name, email, password) {
    const config = loadAccounts();
    
    if (config.accounts.some(a => a.name === name)) {
        return null;
    }
    
    config.accounts.push({ name, email, password });
    
    if (!config.default_account) {
        config.default_account = name;
    }
    
    saveAccounts(config);
    return { name, email, password };
}

// アカウント削除
function removeAccount(name) {
    const config = loadAccounts();
    const idx = config.accounts.findIndex(a => a.name === name);
    
    if (idx === -1) return null;
    
    const removed = config.accounts.splice(idx, 1)[0];
    
    if (config.default_account === name && config.accounts.length > 0) {
        config.default_account = config.accounts[0].name;
    }
    
    saveAccounts(config);
    return removed;
}

function createGeneratedAccountName(existingAccounts, prefix = 'generated-account') {
    const baseStamp = new Date().toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z$/, 'Z')
        .replace('T', '-');

    let suffix = 1;
    let candidate = `${prefix}-${baseStamp}`;

    while (existingAccounts.some((account) => account.name === candidate)) {
        suffix += 1;
        candidate = `${prefix}-${baseStamp}-${suffix}`;
    }

    return candidate;
}

function saveCreatedAccounts(entries = [], options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }

    const config = loadAccounts();
    const savedAccounts = [];
    const prefix = options.prefix || 'generated-account';

    for (const entry of entries) {
        const name = createGeneratedAccountName(config.accounts, prefix);
        const account = {
            name,
            email: entry.email,
            password: entry.password,
            mail_days: entry.mailDays != null ? String(entry.mailDays) : null,
            createdAt: entry.createdAt || new Date().toISOString(),
            source: entry.source || 'create-account',
            browser: entry.browser || null
        };

        config.accounts.push(account);
        savedAccounts.push(account);
    }

    if (!config.default_account && config.accounts.length > 0) {
        config.default_account = config.accounts[0].name;
    }

    saveAccounts(config);
    return savedAccounts;
}

// データディレクトリ初期化
function initDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

// JSON読み込み（存在しない場合は空配列/オブジェクト）
function loadJson(filePath, defaultValue = []) {
    return safeLoadJsonFile(filePath, defaultValue, {
        label: `JSON(${path.basename(filePath)})`
    });
}

// JSON保存
function saveJson(filePath, data) {
    initDataDir();
    writeJsonFileAtomic(filePath, data);
}

// ==================== Workspace管理 ====================

/**
 * Workspaceを追加
 * @param {Object} workspace - { name, email, password, maxSeats, expiryDays }
 */
function addWorkspace(workspace) {
    const workspaces = loadJson(WORKSPACE_FILE, []);
    
    const newWorkspace = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: workspace.name,
        email: workspace.email,
        password: workspace.password,
        maxSeats: workspace.maxSeats || 4,
        usedSeats: 0,
        members: [], // { email, addedAt, expiresAt }
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (workspace.expiryDays || 30) * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active', // active, full, expired
        menuId: workspace.menuId || null,
        isActivated: workspace.isActivated !== false, // true: アクティベーション済み, false: 未アクティベーション
        isPrivate: workspace.isPrivate || false, // true: 1人専用（PA）, false: 共有（SA）
        restrictedRole: workspace.restrictedRole || null, // チケット発行に必要なロールID
        priority: workspace.priority || 0 // 表示順位（高いほど先頭）
    };
    
    workspaces.push(newWorkspace);
    saveJson(WORKSPACE_FILE, workspaces);
    
    return newWorkspace;
}

/**
 * 全Workspace取得
 */
function getAllWorkspaces() {
    return loadJson(WORKSPACE_FILE, []);
}

/**
 * メニューIDでWorkspace取得（priority順でソート）
 */
function getWorkspacesByMenu(menuId) {
    const workspaces = loadJson(WORKSPACE_FILE, []);
    return workspaces
        .filter(w => w.menuId === menuId && w.status !== 'expired')
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Workspace削除
 */
function removeWorkspace(id) {
    const workspaces = loadJson(WORKSPACE_FILE, []);
    const filtered = workspaces.filter(w => w.id !== id);
    saveJson(WORKSPACE_FILE, filtered);
    return workspaces.length !== filtered.length;
}

/**
 * メンバーをWorkspaceに追加
 */
function addMemberToWorkspace(workspaceId, memberEmail) {
    const workspaces = loadJson(WORKSPACE_FILE, []);
    const workspace = workspaces.find(w => w.id === workspaceId);
    
    if (!workspace) return null;
    if (workspace.usedSeats >= workspace.maxSeats) return null;
    
    workspace.members.push({
        email: memberEmail,
        addedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
    workspace.usedSeats = workspace.members.length;
    
    if (workspace.usedSeats >= workspace.maxSeats) {
        workspace.status = 'full';
    }
    
    saveJson(WORKSPACE_FILE, workspaces);
    return workspace;
}

/**
 * Workspaceをアクティベート（有効化）
 */
function activateWorkspace(workspaceId) {
    const workspaces = loadJson(WORKSPACE_FILE, []);
    const workspace = workspaces.find(w => w.id === workspaceId);
    
    if (!workspace) return null;
    
    workspace.isActivated = true;
    workspace.activatedAt = new Date().toISOString();
    
    saveJson(WORKSPACE_FILE, workspaces);
    return workspace;
}

/**
 * メールアドレスでWorkspaceをアクティベート
 */
function activateWorkspaceByEmail(email) {
    const workspaces = loadJson(WORKSPACE_FILE, []);
    const workspace = workspaces.find(w => w.email === email);
    
    if (!workspace) return null;
    
    workspace.isActivated = true;
    workspace.activatedAt = new Date().toISOString();
    
    saveJson(WORKSPACE_FILE, workspaces);
    return workspace;
}

/**
 * 期限切れWorkspaceを自動削除
 */
function cleanupExpiredWorkspaces() {
    const workspaces = loadJson(WORKSPACE_FILE, []);
    const now = new Date();
    
    let cleaned = 0;
    workspaces.forEach(w => {
        if (new Date(w.expiresAt) < now && w.status !== 'expired') {
            w.status = 'expired';
            cleaned++;
        }
    });
    
    if (cleaned > 0) {
        saveJson(WORKSPACE_FILE, workspaces);
        console.log(`🧹 ${cleaned}個の期限切れWorkspaceをクリーンアップしました`);
    }
    
    return cleaned;
}

// ==================== Menu管理 ====================

/**
 * メニューを追加
 * @param {Object} menu - { name, channelId, hidden, allowedRoles }
 */
function addMenu(menu) {
    const menus = loadJson(MENU_FILE, []);
    
    if (menus.some(m => m.name === menu.name)) {
        return null; // 同名メニューが既に存在
    }
    
    const newMenu = {
        id: Date.now().toString(36),
        name: menu.name,
        channelId: menu.channelId,
        messageId: null, // ドロップダウンメッセージID
        hidden: menu.hidden || false,
        allowedRoles: menu.allowedRoles || [],
        menuType: menu.menuType || 'standard', // 'standard', 'PA' (Private Account), 'SA' (Shared Account)
        createdAt: new Date().toISOString()
    };
    
    menus.push(newMenu);
    saveJson(MENU_FILE, menus);
    
    return newMenu;
}

/**
 * メニュー別の空き状況を取得
 * @param {string} menuType - 'PA' | 'SA' | null (全て)
 */
function getMenuAvailability(menuType = null) {
    const menus = loadJson(MENU_FILE, []);
    const workspaces = loadJson(WORKSPACE_FILE, []);
    
    // 対象メニューをフィルタリング
    const targetMenus = menuType 
        ? menus.filter(m => m.menuType === menuType)
        : menus;
    
    let totalAvailable = 0;
    let totalWorkspaces = 0;
    
    targetMenus.forEach(menu => {
        const menuWorkspaces = workspaces.filter(w => 
            w.menuId === menu.id && 
            w.status !== 'expired' &&
            w.isActivated !== false
        );
        
        totalWorkspaces += menuWorkspaces.length;
        
        menuWorkspaces.forEach(ws => {
            if (ws.isPrivate) {
                // PA（Private Account）: 空きワークスペース数（1つにつき1人専用）
                // usedSeats === 0 なら1人参加可能
                if (ws.usedSeats === 0) {
                    totalAvailable += 1;
                }
            } else {
                // SA（Shared Account）: 空き席数
                const available = ws.maxSeats - ws.usedSeats;
                if (available > 0) {
                    totalAvailable += available;
                }
            }
        });
    });
    
    return {
        menuCount: targetMenus.length,
        workspaceCount: totalWorkspaces,
        availableSlots: totalAvailable
    };
}

/**
 * 特定のメニュータイプに属するワークスペースを取得
 */
function getWorkspacesByMenuType(menuType) {
    const menus = loadJson(MENU_FILE, []);
    const workspaces = loadJson(WORKSPACE_FILE, []);
    
    const targetMenuIds = menus
        .filter(m => m.menuType === menuType)
        .map(m => m.id);
    
    return workspaces.filter(w => 
        targetMenuIds.includes(w.menuId) &&
        w.status !== 'expired' &&
        w.isActivated !== false
    );
}

/**
 * メニュー削除
 */
function removeMenu(name) {
    const menus = loadJson(MENU_FILE, []);
    const menu = menus.find(m => m.name === name);
    
    if (!menu) return null;
    
    // 関連するWorkspaceのmenuIdをnullに
    const workspaces = loadJson(WORKSPACE_FILE, []);
    workspaces.forEach(w => {
        if (w.menuId === menu.id) w.menuId = null;
    });
    saveJson(WORKSPACE_FILE, workspaces);
    
    // メニューを削除
    const filtered = menus.filter(m => m.name !== name);
    saveJson(MENU_FILE, filtered);
    
    return menu;
}

/**
 * 全メニュー取得
 */
function getAllMenus() {
    return loadJson(MENU_FILE, []);
}

/**
 * メニュー取得（名前で）
 */
function getMenuByName(name) {
    const menus = loadJson(MENU_FILE, []);
    return menus.find(m => m.name === name);
}

/**
 * メニューの表示/非表示切り替え
 */
function setMenuVisibility(name, hidden, allowedRoles = []) {
    const menus = loadJson(MENU_FILE, []);
    const menu = menus.find(m => m.name === name);
    
    if (!menu) return null;
    
    menu.hidden = hidden;
    menu.allowedRoles = allowedRoles;
    
    saveJson(MENU_FILE, menus);
    return menu;
}

/**
 * メニューのメッセージID更新
 */
function updateMenuMessageId(name, messageId) {
    const menus = loadJson(MENU_FILE, []);
    const menu = menus.find(m => m.name === name);
    
    if (!menu) return null;
    
    menu.messageId = messageId;
    saveJson(MENU_FILE, menus);
    return menu;
}

// ==================== Ticket管理 ====================

/**
 * チケット作成
 */
function createTicket(ticket) {
    const tickets = loadJson(TICKET_FILE, []);
    
    const newTicket = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        userId: ticket.userId,
        username: ticket.username,
        workspaceId: ticket.workspaceId,
        channelId: ticket.channelId,
        status: 'open', // open, closed
        createdAt: new Date().toISOString(),
        closedAt: null
    };
    
    tickets.push(newTicket);
    saveJson(TICKET_FILE, tickets);
    
    return newTicket;
}

/**
 * チケット取得（ユーザーIDで）
 */
function getTicketByUser(userId) {
    const tickets = loadJson(TICKET_FILE, []);
    return tickets.find(t => t.userId === userId && t.status === 'open');
}

/**
 * チケットクローズ
 */
function closeTicket(ticketId) {
    const tickets = loadJson(TICKET_FILE, []);
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) return null;
    
    ticket.status = 'closed';
    ticket.closedAt = new Date().toISOString();
    
    saveJson(TICKET_FILE, tickets);
    return ticket;
}

// 全チケット削除（リセット）
function resetAllTickets() {
    const tickets = loadJson(TICKET_FILE, []);
    const count = tickets.length;
    saveJson(TICKET_FILE, []);
    return count;
}

// ユーザーのチケット削除
function removeUserTicket(userId) {
    const tickets = loadJson(TICKET_FILE, []);
    const filtered = tickets.filter(t => t.userId !== userId);
    const removed = tickets.length - filtered.length;
    saveJson(TICKET_FILE, filtered);
    return removed;
}

// ==================== エクスポート ====================

module.exports = {
    // Workspace
    addWorkspace,
    getAllWorkspaces,
    getWorkspacesByMenu,
    removeWorkspace,
    addMemberToWorkspace,
    activateWorkspace,
    activateWorkspaceByEmail,
    cleanupExpiredWorkspaces,
    
    // Menu
    addMenu,
    removeMenu,
    getAllMenus,
    getMenuByName,
    setMenuVisibility,
    updateMenuMessageId,
    getMenuAvailability,
    getWorkspacesByMenuType,
    
    // Ticket
    createTicket,
    getTicketByUser,
    closeTicket,
    resetAllTickets,
    removeUserTicket,
    
    // Accounts
    loadAccounts,
    saveAccounts,
    getAccount,
    getAllAccounts,
    addAccount,
    removeAccount,
    saveCreatedAccounts,
    createGeneratedAccountName
};
