/**
 * Discord Bot - ChatGPTサインアップ自動化 (Firefox/Chrome自動切り替え)
 * Slash Command: /create-account
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');
const { safeDeferReply, safeEditReply, isUnknownInteractionError } = require('./utils/discord-interaction');

require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
    console.error('❌ DISCORD_TOKENが設定されていません');
    process.exit(1);
}

// PayPalセッション管理モジュール
const { checkSession, getSessionStats, clearSession } = require('./paypal_session_manager');

// Workspace & Menu 管理モジュール
const {
    addMenu, removeMenu, getAllMenus, getMenuByName, setMenuVisibility, updateMenuMessageId,
    addWorkspace, getAllWorkspaces, getWorkspacesByMenu, removeWorkspace, addMemberToWorkspace, activateWorkspaceByEmail, cleanupExpiredWorkspaces,
    createTicket, getTicketByUser, closeTicket, resetAllTickets, removeUserTicket,
    getAccount, getAllAccounts, addAccount, removeAccount, loadAccounts,
    getMenuAvailability, getWorkspacesByMenuType
} = require('./workspace_manager');

// 起動時に期限切れをクリーンアップ
cleanupExpiredWorkspaces();
// 1時間ごとにクリーンアップ
setInterval(cleanupExpiredWorkspaces, 60 * 60 * 1000);

// コマンド定義
const commands = [
    new SlashCommandBuilder()
        .setName('create-account')
        .setDescription('ChatGPTワークスペースを作成します')
        .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('作成するアカウント数（1-5）')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(5)
        )
        .addStringOption(option =>
            option
                .setName('menu')
                .setDescription('作成後に追加するドロップダウンメニュー')
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('チケット発行に必要なロール（指定するとそのロールのみ発行可能）')
                .setRequired(false)
        )
        .toJSON(),
    new SlashCommandBuilder()
        .setName('paypal-status')
        .setDescription('PayPalのログイン状態を確認します')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('paypal-launch')
        .setDescription('ログイン済み状態でPayPalを開きます')
        .addBooleanOption(option =>
            option
                .setName('force-login')
                .setDescription('ログインを強制する（既存セッションを無視）')
                .setRequired(false)
        )
        .toJSON(),
    new SlashCommandBuilder()
        .setName('paypal-clear')
        .setDescription('PayPalのログインセッションをクリアします')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('paypal-login')
        .setDescription('PayPalにログインします（自動検知・セッション保存付き）')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('openbrowser')
        .setDescription('ブラウザを起動します')
        .addStringOption(option =>
            option
                .setName('browser')
                .setDescription('使用するブラウザ')
                .setRequired(false)
                .addChoices(
                    { name: 'Brave', value: 'brave' },
                    { name: 'Chrome', value: 'chrome' }
                )
        )
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('開くURL')
                .setRequired(false)
                .addChoices(
                    { name: 'ChatGPT', value: 'chatgpt' },
                    { name: 'PayPal（ログイン維持）', value: 'paypal' }
                )
        )
        .toJSON(),
    // ==================== メニュー管理コマンド ====================
    new SlashCommandBuilder()
        .setName('menu')
        .setDescription('ドロップダウンメニュー管理')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('ドロップダウンメニューを作成（PASAでPAとSA同時作成）')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('メニュー名（PASAでPAとSA同時作成）')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('ドロップダウンメニューを削除')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('メニュー名')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('hide')
                .setDescription('特定ロールのみ表示')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('メニュー名')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('表示させるロール')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('全員に表示')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('メニュー名')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('メニュー一覧を表示')
        )
        .toJSON(),
    new SlashCommandBuilder()
        .setName('reload')
        .setDescription('全メニューを最新状態に更新します'),
    // ==================== Account管理コマンド ====================
    new SlashCommandBuilder()
        .setName('account')
        .setDescription('アカウント管理')
        .addSubcommand(subcommand =>
            subcommand
                .setName('available')
                .setDescription('利用可能なアカウント状況を表示')
        )
        .toJSON(),
    // ==================== Workspace管理コマンド ====================
    new SlashCommandBuilder()
        .setName('workspace')
        .setDescription('Workspace管理')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Workspaceを追加')
                .addStringOption(option =>
                    option
                        .setName('email')
                        .setDescription('メールアドレス')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('password')
                        .setDescription('パスワード')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('menu')
                        .setDescription('追加先メニュー')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('seats')
                        .setDescription('最大席数（デフォルト4）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(4)
                )
                .addIntegerOption(option =>
                    option
                        .setName('expiry')
                        .setDescription('有効期限（日数、デフォルト30）')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(365)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Workspace一覧')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Workspaceを削除')
                .addStringOption(option =>
                    option
                        .setName('id')
                        .setDescription('Workspace ID')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('activation')
                .setDescription('Workspaceの1ヶ月無料オファーを有効化')
                .addStringOption(option =>
                    option
                        .setName('email')
                        .setDescription('Workspaceメールアドレス')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('password')
                        .setDescription('Workspaceパスワード')
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup
                .setName('account')
                .setDescription('アカウント管理')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('アカウントを追加')
                        .addStringOption(option =>
                            option
                                .setName('name')
                                .setDescription('アカウント名（例: default, main, sub1）')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('email')
                                .setDescription('メールアドレス')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('password')
                                .setDescription('パスワード')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('アカウントを削除')
                        .addStringOption(option =>
                            option
                                .setName('name')
                                .setDescription('アカウント名')
                                .setRequired(true)
                                .setAutocomplete(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('アカウント一覧')
                )
        )
        .toJSON(),
    // ==================== Activationコマンド ====================
    new SlashCommandBuilder()
        .setName('activation')
        .setDescription('Workspace招待を送信（チケットチャンネル専用）')
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('招待メールを送信')
                .addStringOption(option =>
                    option
                        .setName('email')
                        .setDescription('招待するメールアドレス')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('招待処理をキャンセル')
        )
        .toJSON(),
    // ==================== Ticket管理コマンド ====================
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('チケット管理')
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('全チケット情報をリセット（管理者用）')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('myclear')
                .setDescription('自分のチケットを削除')
        )
        .toJSON()
];

// コマンド登録
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 スラッシュコマンドを登録中...');
        
        // グローバルコマンドを空に（過去のコマンドを削除）
        console.log('🌐 グローバルコマンドをクリア...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: [] }
        );
        console.log('✅ グローバルコマンドをクリアしました');
        
        if (GUILD_ID) {
            // ギルドコマンドを登録（即時反映）
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            console.log(`✅ サーバー ${GUILD_ID} にコマンドを登録しました`);
            console.log('📋 登録済みコマンド:');
            commands.forEach(cmd => console.log(`   • /${cmd.name}`));
        } else {
            // グローバルコマンドを登録（反映に最大1時間）
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
            console.log('✅ グローバルコマンドを登録しました');
            console.log('⏳ 反映に最大1時間かかる場合があります');
        }
    } catch (error) {
        console.error('❌ コマンド登録エラー:', error);
    }
})();

// Botクライアント作成
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

client.once('clientReady', () => {
    console.log(`✅ Discord Bot ログイン完了: ${client.user.tag}`);
    console.log('🔄 Brave/Chrome自動切り替えモード');
    console.log('🤖 /create-account コマンドでアカウント作成を開始できます');
});

// 進捗状況を更新する関数
async function updateProgress(interaction, step, percent) {
    const filledProgress = '🔵'.repeat(Math.floor(percent / 10)) + '⚪'.repeat(10 - Math.floor(percent / 10));
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🚀 ChatGPTアカウント作成中')
        .setDescription(`\`${filledProgress}\` **${percent}%**\n\n📋 **${step}**`)
        .setTimestamp();
    
    await safeEditReply(interaction, {
        content: null,
        embeds: [embed]
    });
}

// コマンド処理
client.on('interactionCreate', async (interaction) => {
    // Autocompleteハンドラ
    if (interaction.isAutocomplete()) {
        const { getAllMenus } = require('./workspace_manager');
        
        try {
            if (interaction.commandName === 'menu' && interaction.options.getSubcommand() === 'remove') {
                const menus = getAllMenus();
                const choices = menus.map(menu => ({
                    name: menu.name,
                    value: menu.name
                }));
                await interaction.respond(choices.slice(0, 25));
                return;
            }
            
            if (interaction.commandName === 'menu' && interaction.options.getSubcommand() === 'hide') {
                const menus = getAllMenus();
                const choices = menus.map(menu => ({
                    name: menu.name,
                    value: menu.name
                }));
                await interaction.respond(choices.slice(0, 25));
                return;
            }
            
            if (interaction.commandName === 'workspace' && interaction.options.getSubcommand() === 'add') {
                const menus = getAllMenus();
                const choices = menus.map(menu => ({
                    name: menu.name,
                    value: menu.name
                }));
                await interaction.respond(choices.slice(0, 25));
                return;
            }
            
            if (interaction.commandName === 'create-account' && interaction.options.getFocused(true).name === 'menu') {
                const menus = getAllMenus();
                const choices = menus.map(menu => ({
                    name: menu.name,
                    value: menu.name
                }));
                await interaction.respond(choices.slice(0, 25));
                return;
            }
        } catch (error) {
            console.error('❌ Autocompleteエラー:', error);
            await interaction.respond([]);
        }
        return;
    }
    
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'create-account') {
            await handleCreateAccount(interaction);
            return;
        }

        if (interaction.commandName === 'paypal-status') {
            await handlePayPalStatus(interaction);
            return;
        }

        if (interaction.commandName === 'paypal-launch') {
            await handlePayPalLaunch(interaction);
            return;
        }

        if (interaction.commandName === 'paypal-clear') {
            await handlePayPalClear(interaction);
            return;
        }

        if (interaction.commandName === 'paypal-login') {
            await handlePayPalLogin(interaction);
            return;
        }

        if (interaction.commandName === 'openbrowser') {
            await handleOpenBrowser(interaction);
            return;
        }

        // ==================== メニュー管理コマンド ====================
        if (interaction.commandName === 'menu') {
            await handleMenuCommand(interaction);
            return;
        }

        // ==================== Account管理コマンド ====================
        if (interaction.commandName === 'account') {
            await handleAccountCommand(interaction);
            return;
        }

        // ==================== Reloadコマンド ====================
        if (interaction.commandName === 'reload') {
            await handleReloadCommand(interaction);
            return;
        }

        // ==================== Workspace管理コマンド ====================
        if (interaction.commandName === 'workspace') {
            await handleWorkspaceCommand(interaction);
            return;
        }

        // ==================== Activationコマンド ====================
        if (interaction.commandName === 'activation') {
            await handleActivationCommand(interaction);
            return;
        }

        // ==================== Ticket管理コマンド ====================
        if (interaction.commandName === 'ticket') {
            await handleTicketCommand(interaction);
            return;
        }
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            console.warn('⚠️ Interactionの有効期限切れを検知したため処理を終了しました (10062)');
            return;
        }
        console.error('❌ interactionCreate処理エラー:', error);
    }
});

// ブラウザパスを検出
function detectBrowserPaths() {
    const fs = require('fs');
    const isMac = process.platform === 'darwin';
    const paths = { brave: null, chrome: null };
    
    const bravePaths = [
        process.env.BRAVE_PATH,
        ...(isMac ? [
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/usr/bin/brave-browser'
        ] : [
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ])
    ];
    
    for (const p of bravePaths) {
        if (p && fs.existsSync(p)) {
            paths.brave = p;
            break;
        }
    }
    
    const chromePaths = [
        process.env.CHROME_PATH,
        ...(isMac ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/usr/bin/google-chrome'
        ] : [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ])
    ];
    
    for (const p of chromePaths) {
        if (p && fs.existsSync(p)) {
            paths.chrome = p;
            break;
        }
    }
    
    return paths;
}

// アカウント作成処理（並列対応）
async function handleCreateAccount(interaction) {
    // 作成数を取得（デフォルトは1）
    const count = interaction.options.getInteger('count') || 1;
    const menuName = interaction.options.getString('menu');
    const restrictedRole = interaction.options.getRole('role');
    
    // 3秒制限対策: 先にdeferしてから編集応答を返す
    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    // ブラウザパスを検出
    const browserPaths = detectBrowserPaths();
    const availableBrowsers = [];
    if (browserPaths.brave) availableBrowsers.push({ type: 'brave', path: browserPaths.brave, emoji: '🦁' });
    if (browserPaths.chrome) availableBrowsers.push({ type: 'chrome', path: browserPaths.chrome, emoji: '🌐' });
    
    if (availableBrowsers.length === 0) {
        return safeEditReply(interaction, {
            content: '❌ 使用可能なブラウザが見つかりません。BraveまたはChromeをインストールしてください。'
        });
    }

    const initialEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`🚀 ChatGPTアカウント作成中 (0/${count})`)
        .setDescription(`⏳ 検出ブラウザ: ${availableBrowsers.map(b => b.emoji).join(' ')}\n順番に1個ずつ処理します...`)
        .setTimestamp();

    const initialReplySent = await safeEditReply(interaction, {
        content: null,
        embeds: [initialEmbed], 
    });
    if (!initialReplySent) {
        return;
    }

    const results = [];
    const errors = [];
    let completed = 0;
    let animationInterval = null;

    // 各アカウントの進捗状況を管理
    const progressStatus = {};
    for (let i = 1; i <= count; i++) {
        const browserIndex = (i - 1) % availableBrowsers.length;
        const browserInfo = availableBrowsers[browserIndex];
        progressStatus[i] = {
            index: i,
            browser: browserInfo.type,
            emoji: browserInfo.emoji,
            status: '⏳',
            step: '準備中',
            percent: 0
        };
    }

    // ローディングアニメーション用
    const loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;

    try {
        // 並列処理用の関数
        const createAccountWithBrowser = async (index, browserInfo) => {
            try {
                // ステータスを実行中に更新
                progressStatus[index].status = '🔄';
                progressStatus[index].step = 'ブラウザ起動中';
                progressStatus[index].percent = 10;

                // カスタム進捗更新関数
                const customUpdateProgress = async (interaction, step, percent) => {
                    progressStatus[index].step = step;
                    progressStatus[index].percent = percent;
                };

                // ブラウザ指定でスクリプトを実行
                const result = await runSignupScriptWithBrowser(interaction, customUpdateProgress, browserInfo);
                
                // 完了ステータスに更新
                progressStatus[index].status = '✅';
                progressStatus[index].step = '完了';
                progressStatus[index].percent = 100;
                
                results.push({ ...result, browser: browserInfo.type, index });
                completed++;
                
            } catch (error) {
                console.error(`❌ アカウント ${index} の作成エラー:`, error);
                
                // エラーステータスに更新
                progressStatus[index].status = '❌';
                progressStatus[index].step = 'エラー';
                progressStatus[index].percent = 0;
                
                errors.push({ index, error: error.message, browser: browserInfo.type });
                completed++;
            }
        };

        // 進捗表示を更新する関数
        const updateProgressDisplay = async () => {
            try {
                frameIndex = (frameIndex + 1) % loadingFrames.length;
                const loadingFrame = loadingFrames[frameIndex];
                
                let description = '';
                
                for (let i = 1; i <= count; i++) {
                    const status = progressStatus[i];
                    const filled = Math.floor(status.percent / 10);
                    const empty = 10 - filled;
                    
                    // 絵文字プログレスバー
                    const progressBar = '🟩'.repeat(filled) + '⬜'.repeat(empty);
                    
                    if (status.status === '🔄') {
                        description += `${loadingFrame} ${status.emoji} #${i}: ${progressBar} ${status.percent}%\n   └ ${status.step}\n\n`;
                    } else if (status.status === '✅') {
                        description += `✅ ${status.emoji} #${i}: 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 100%\n   └ 完了\n\n`;
                    } else if (status.status === '❌') {
                        description += `❌ ${status.emoji} #${i}: 🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥 ERROR\n   └ ${status.step}\n\n`;
                    } else {
                        description += `⏳ ${status.emoji} #${i}: ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%\n   └ 待機中\n\n`;
                    }
                }
                
                description += `━━━━━━━━━━━━━━━━\n`;
                description += `✅ 完了: ${results.length}  ⏳ 処理中: ${count - results.length - errors.length}  ❌ エラー: ${errors.length}`;

                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`🚀 アカウント作成中 (${completed}/${count})`)
                    .setDescription(description)
                    .setTimestamp();

                await safeEditReply(interaction, { content: null, embeds: [embed] }).catch(() => {});
            } catch (e) {}
        };

        // アニメーション開始
        animationInterval = setInterval(updateProgressDisplay, 1000);

        // タスクを順番に1個ずつ実行（並列無し）
        for (let i = 0; i < count; i++) {
            const browserIndex = i % availableBrowsers.length;
            const browserInfo = availableBrowsers[browserIndex];
            
            await createAccountWithBrowser(i + 1, browserInfo);
        }

        // アニメーション停止
        if (animationInterval) clearInterval(animationInterval);

        // 結果をインデックス順にソート
        results.sort((a, b) => a.index - b.index);
        errors.sort((a, b) => a.index - b.index);

        // メニュー指定があれば、作成したアカウントをワークスペースとして追加（未アクティベーション状態）
        let addedToMenu = [];
        if (menuName && results.length > 0) {
            const menu = getMenuByName(menuName);
            if (menu) {
                for (const result of results) {
                    try {
                        const workspace = addWorkspace({
                            name: `Workspace-${Date.now().toString(36).substr(-4)}`,
                            email: result.email,
                            password: result.password,
                            maxSeats: 4,
                            expiryDays: 30,
                            menuId: menu.id,
                            isActivated: false, // 未アクティベーション状態
                            isPrivate: menu.menuType === 'PA', // PAなら1人専用、SAなら共有
                            restrictedRole: restrictedRole ? restrictedRole.id : null, // ロール制限
                            priority: restrictedRole ? 100 : 0 // ロール制限ありは必ず先頭に表示
                        });
                        addedToMenu.push({ 
                            email: result.email, 
                            workspaceId: workspace.id,
                            restrictedRole: restrictedRole ? restrictedRole.name : null
                        });
                    } catch (e) {
                        console.error(`ワークスペース追加エラー: ${result.email}`, e);
                    }
                }
                
                // メニューメッセージを更新
                try {
                    await updateMenuMessage(interaction, menu);
                } catch (e) {
                    console.error('メニュー更新エラー:', e);
                }
            }
        }

        // 最終結果表示
        const embed = new EmbedBuilder()
            .setColor(errors.length === 0 ? 0x00FF00 : 0xFFA500)
            .setTitle(`✅ アカウント作成完了 (${results.length}/${count})`)
            .setTimestamp();

        // 成功したアカウントを表示
        if (results.length > 0) {
            let accountsText = '';
            results.forEach((result) => {
                const browserEmoji = result.browser === 'brave' ? '🦁' : '🌐';
                accountsText += `\n**アカウント ${result.index}** ${browserEmoji}\n`;
                accountsText += `📧 \`${result.email}\`\n`;
                accountsText += `🔑 \`${result.password}\`\n`;
            });
            
            // メニュー追加情報を表示
            if (addedToMenu.length > 0) {
                accountsText += `\n📁 **メニュー「${menuName}」に自動追加しました** (${addedToMenu.length}件)`;
                if (restrictedRole) {
                    accountsText += `\n🔒 ロール制限: <@&${restrictedRole.id}> のみ利用可能`;
                }
            }
            
            embed.setDescription(accountsText);
        }

        // エラーがあれば表示
        if (errors.length > 0) {
            let errorText = '\n**⚠️ エラー**\n';
            errors.forEach(e => {
                const browserEmoji = e.browser === 'brave' ? '🦁' : '🌐';
                errorText += `アカウント ${e.index} ${browserEmoji}: ${e.error}\n`;
            });
            embed.addFields({ name: 'エラー詳細', value: errorText });
        }

        await safeEditReply(interaction, {
            content: null,
            embeds: [embed]
        });

    } catch (error) {
        // エラー時もアニメーションを停止
        if (animationInterval) clearInterval(animationInterval);
        
        console.error('❌ エラー:', error);

        try {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ エラーが発生しました')
                .setDescription(`\`\`\`${error.message}\`\`\``)
                .setTimestamp();

            await safeEditReply(interaction, {
                content: null,
                embeds: [errorEmbed]
            });
        } catch (e) {
            console.error('Discord応答エラー:', e);
        }
    }
}

// Puppeteerスクリプト実行関数（ブラウザ指定対応）
function runSignupScriptWithBrowser(interaction, updateProgress, browserInfo) {
    return new Promise((resolve, reject) => {
        // OSに応じてNodeパスを決定（macOS/Windows両対応）
        const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
        const scriptPath = path.join(__dirname, 'puppeteer_unified.js');

        const child = spawn(nodePath, [scriptPath], {
            env: {
                ...process.env,
                PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                HEADLESS: process.env.HEADLESS || 'false',
                FORCE_BROWSER: browserInfo.type, // ブラウザを強制指定
                BRAVE_PATH: browserInfo.type === 'brave' ? browserInfo.path : '',
                CHROME_PATH: browserInfo.type === 'chrome' ? browserInfo.path : ''
            },
            timeout: 180000 // 3分タイムアウト
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', async (data) => {
            const output = data.toString();
            stdout += output;
            console.log(output);

            try {
                if (output.includes('Step 1:') || output.includes('mail.tmアカウント作成')) {
                    await updateProgress(interaction, 'メールアドレス生成中', 15);
                } else if (output.includes('Step 2:') || output.includes('Brave を起動中') || output.includes('Chrome を起動中')) {
                    await updateProgress(interaction, 'ブラウザ起動中', 30);
                } else if (output.includes('Step 5:')) {
                    await updateProgress(interaction, 'アカウント作成開始', 45);
                } else if (output.includes('Step 6:')) {
                    await updateProgress(interaction, 'パスワード設定中', 55);
                } else if (output.includes('Step 8:')) {
                    await updateProgress(interaction, '検証コード待機中', 65);
                } else if (output.includes('Step 9:')) {
                    await updateProgress(interaction, '検証コード入力中', 75);
                } else if (output.includes('Step 15:')) {
                    await updateProgress(interaction, 'ワークスペース作成ページへ', 85);
                } else if (output.includes('Step 16:')) {
                    await updateProgress(interaction, 'ワークスペース名入力中', 90);
                } else if (output.includes('Step 17:')) {
                    await updateProgress(interaction, '送信完了', 95);
                } else if (output.includes('アカウント作成完了')) {
                    await updateProgress(interaction, '完了！', 100);
                }
            } catch (e) {
                // 更新エラーは無視
            }
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(data.toString());
        });

        child.on('close', (code) => {
            const result = parseResult(stdout);

            if (result.email && result.password) {
                resolve(result);
            } else {
                reject(new Error('アカウント情報の取得に失敗しました\n' + stderr));
            }
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
}

// Puppeteerスクリプト実行関数（後方互換性のため）
function runSignupScript(interaction, updateProgress) {
    return runSignupScriptWithProgress(interaction, updateProgress);
}

// 出力からアカウント情報を抽出
function parseResult(output) {
    const result = {
        email: null,
        password: null,
        workspace: null,
        browser: null
    };

    const emailMatch = output.match(/Email:\s*([^\s]+@[\w.]+)/i);
    if (emailMatch) result.email = emailMatch[1];

    const passMatch = output.match(/Password:\s*(\S+)/i);
    if (passMatch) result.password = passMatch[1];

    const workspaceMatch = output.match(/Workspace:\s*(\S+)/i);
    if (workspaceMatch) result.workspace = workspaceMatch[1];

    const browserMatch = output.match(/(Brave|Chrome)を起動中/);
    if (browserMatch) result.browser = browserMatch[1].toLowerCase();

    return result;
}

// PayPalステータス確認処理
async function handlePayPalStatus(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    try {
        const status = checkSession();
        const stats = getSessionStats();
        
        let statusEmoji = stats.isLoggedIn ? '✅' : '❌';
        let statusColor = stats.isLoggedIn ? 0x00FF00 : 0xFFA500;
        
        const embed = new EmbedBuilder()
            .setColor(statusColor)
            .setTitle('💳 PayPalログイン状態')
            .setDescription(`${statusEmoji} **${status.message}**`)
            .setTimestamp();
        
        if (stats.exists) {
            embed.addFields(
                { name: '💾 セッション保存日', value: stats.savedAt ? new Date(stats.savedAt).toLocaleString('ja-JP') : '不明', inline: true },
                { name: '⏱️ 経過時間', value: `${stats.age.days}日 ${stats.age.hours}時間 ${stats.age.minutes}分`, inline: true }
            );
            
            if (stats.lastChecked) {
                embed.addFields(
                    { name: '🔍 最終確認', value: new Date(stats.lastChecked).toLocaleString('ja-JP'), inline: true }
                );
            }
        } else {
            embed.addFields(
                { name: 'ℹ️ 情報', value: 'セッションが保存されていません\n`/paypal-login` または `/paypal-launch` でログインしてください', inline: false }
            );
        }

        await safeEditReply(interaction, { content: null, embeds: [embed] });

    } catch (error) {
        console.error('❌ PayPalステータス確認エラー:', error);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ エラーが発生しました')
            .setDescription(`\`\`\`${error.message}\`\`\``)
            .setTimestamp();
        await safeEditReply(interaction, { content: null, embeds: [errorEmbed] });
    }
}

// PayPal起動処理（ログイン済み状態で開く）
async function handlePayPalLaunch(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    const forceLogin = interaction.options.getBoolean('force-login') || false;
    
    // セッション確認
    const status = checkSession();
    
    let description = '🚀 PayPalを起動します...\n\n';
    
    if (status.isValid && status.isLoggedIn && !forceLogin) {
        description += '✅ **ログイン済みセッションを検出しました**\n';
        description += `📧 ${status.details?.email || 'アカウント'}\n`;
        description += '🔓 ログイン状態でPayPalを開きます';
    } else if (forceLogin) {
        description += '🔑 **ログインを強制します**\n';
        description += 'ログインページを開きます';
    } else {
        description += '⚠️ **セッションが見つかりません**\n';
        description += 'ログインページを開きます\n';
        description += '👆 手動でログインしてください';
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('💳 PayPal起動')
        .setDescription(description)
        .setTimestamp();

    const initialReplySent = await safeEditReply(interaction, { content: null, embeds: [embed] });
    if (!initialReplySent) {
        return;
    }

    try {
        const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
        const scriptPath = path.join(__dirname, 'puppeteer_paypal_persistent.js');
        
        const args = [scriptPath];
        if (forceLogin) {
            args.push('--force-login');
        }
        
        const child = spawn(nodePath, args, {
            env: { 
                ...process.env, 
                PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                HEADLESS: 'false'
            },
            detached: true,
            stdio: 'ignore'
        });
        
        child.unref();
        
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ PayPalを開きました')
            .setDescription(
                status.isValid && status.isLoggedIn && !forceLogin
                    ? '🔓 **ログイン済み状態**でPayPalを開きました\n\n💡 自動的にダッシュボードが表示されます\nブラウザは開いたまま維持されます'
                    : '🔑 **ログインページ**を開きました\n\n👆 手動でログインしてください\n💡 ログイン後、自動的にセッションが保存されます'
            )
            .setTimestamp();

        await safeEditReply(interaction, { content: null, embeds: [successEmbed] });

    } catch (error) {
        console.error('❌ PayPal起動エラー:', error);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ エラーが発生しました')
            .setDescription(`\`\`\`${error.message}\`\`\``)
            .setTimestamp();
        await safeEditReply(interaction, { content: null, embeds: [errorEmbed] });
    }
}

// PayPalセッションクリア処理
async function handlePayPalClear(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    try {
        const stats = getSessionStats();
        
        if (!stats.exists) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('ℹ️ セッションクリア')
                .setDescription('クリアするセッションがありません')
                .setTimestamp();
            await safeEditReply(interaction, { content: null, embeds: [embed] });
            return;
        }
        
        clearSession();
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🗑️ セッションをクリアしました')
            .setDescription(
                `✅ PayPalのログインセッションをクリアしました\n\n` +
                `📧 以前のアカウント: ${stats.email || '不明'}\n` +
                `💡 次回 `/paypal-launch` または `/paypal-login` で新しくログインしてください`
            )
            .setTimestamp();
        
        await safeEditReply(interaction, { content: null, embeds: [embed] });

    } catch (error) {
        console.error('❌ PayPalセッションクリアエラー:', error);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ エラーが発生しました')
            .setDescription(`\`\`\`${error.message}\`\`\``)
            .setTimestamp();
        await safeEditReply(interaction, { content: null, embeds: [errorEmbed] });
    }
}

// PayPalログイン処理（新・セッション管理付き）
async function handlePayPalLogin(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    const status = checkSession();
    
    let description = '💳 PayPalログイン\n\n';
    
    if (status.isValid && status.isLoggedIn) {
        description += `✅ **既にログイン済みです**\n`;
        description += `📧 ${status.details?.email || 'アカウント'}\n\n`;
        description += 'ログインページを開きますか？\n';
        description += '（`/paypal-launch` でダッシュボードを開くこともできます）';
    } else {
        description += '🔑 **PayPalにログインします**\n\n';
        description += 'ブラウザが開き、ログインページに移動します\n';
        description += '👆 手動でログインしてください\n';
        description += '💡 ログイン後、自動的にセッションが保存されます';
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('💳 PayPalログイン')
        .setDescription(description)
        .setTimestamp();

    const initialReplySent = await safeEditReply(interaction, { content: null, embeds: [embed] });
    if (!initialReplySent) {
        return;
    }

    try {
        const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
        const scriptPath = path.join(__dirname, 'puppeteer_paypal_persistent.js');
        
        const child = spawn(nodePath, [scriptPath], {
            env: { 
                ...process.env, 
                PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                HEADLESS: 'false'
            },
            detached: true,
            stdio: 'ignore'
        });
        
        child.unref();
        
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ PayPalログインページを開きました')
            .setDescription(
                '🔑 **ログインページ**を開きました\n\n' +
                '👆 **手順:**\n' +
                '1. ブラウザでPayPalにログインしてください\n' +
                '2. ログイン後、自動的にセッションが保存されます\n' +
                '3. 次回から `/paypal-launch` でログイン済み状態で開けます\n\n' +
                '💡 ブラウザは開いたまま維持されます'
            )
            .setTimestamp();

        await safeEditReply(interaction, { content: null, embeds: [successEmbed] });

    } catch (error) {
        console.error('❌ PayPalログインエラー:', error);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ エラーが発生しました')
            .setDescription(`\`\`\`${error.message}\`\`\``)
            .setTimestamp();
        await safeEditReply(interaction, { content: null, embeds: [errorEmbed] });
    }
}

// ブラウザ起動処理
async function handleOpenBrowser(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    const browserChoice = interaction.options.getString('browser');
    const urlChoice = interaction.options.getString('url');
    const browserName = browserChoice ? browserChoice.toUpperCase() : '自動選択';
    
    // PayPalが選択された場合は専用スクリプトを使用
    if (urlChoice === 'paypal') {
        const status = checkSession();
        
        let description = '💳 PayPal起動\n\n';
        if (status.isValid && status.isLoggedIn) {
            description += '✅ **ログイン済みセッションを検出**\n🔓 ログイン状態でPayPalを開きます';
        } else {
            description += '⚠️ **セッションが見つかりません**\n🔑 ログインページを開きます';
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🌐 ブラウザ起動')
            .setDescription(description)
            .setTimestamp();

        const initialReplySent = await safeEditReply(interaction, { content: null, embeds: [embed] });
        if (!initialReplySent) return;

        try {
            const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
            const scriptPath = path.join(__dirname, 'puppeteer_paypal_persistent.js');
            
            const child = spawn(nodePath, [scriptPath], {
                env: { 
                    ...process.env, 
                    PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                    HEADLESS: 'false'
                },
                detached: true,
                stdio: 'ignore'
            });
            
            child.unref();
            
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ ブラウザを起動しました')
                .setDescription(
                    status.isValid && status.isLoggedIn
                        ? '🔓 **ログイン済み状態**でPayPalを開きました'
                        : '🔑 **ログインページ**を開きました\n👆 手動でログインしてください'
                )
                .setTimestamp();

            await safeEditReply(interaction, { content: null, embeds: [successEmbed] });
            return;
            
        } catch (error) {
            console.error('❌ PayPal起動エラー:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ エラーが発生しました')
                .setDescription(`\`\`\`${error.message}\`\`\``)
                .setTimestamp();
            await safeEditReply(interaction, { content: null, embeds: [errorEmbed] });
            return;
        }
    }
    
    // ChatGPTまたはデフォルト
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🌐 ブラウザ起動')
        .setDescription(`${browserName}でブラウザを起動します...`)
        .setTimestamp();

    const initialReplySent = await safeEditReply(interaction, {
        content: null,
        embeds: [embed],
    });
    if (!initialReplySent) {
        return;
    }

    try {
        // OSに応じてNodeパスを決定（macOS/Windows両対応）
        const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
        const scriptPath = path.join(__dirname, 'open_browser.js');
        
        const args = [scriptPath];
        if (browserChoice) {
            args.push(browserChoice);
        }
        
        const child = spawn(nodePath, args, {
            env: { 
                ...process.env, 
                PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                HEADLESS: 'false'
            },
            detached: true,
            stdio: 'ignore'
        });
        
        child.unref();
        
        // 完了メッセージ
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ ブラウザを起動しました')
            .setDescription(`${browserChoice === 'brave' ? '🦁 Brave' : browserChoice === 'chrome' ? '🌐 Chrome' : '🔍 自動選択'}でブラウザを起動しました。\n\n👆 **手順:**\n1. ブラウザがChatGPTに移動します\n2. 手動で操作してください\n3. ブラウザは30分間開いたまま維持されます`)
            .setTimestamp();

        await safeEditReply(interaction, {
            content: null,
            embeds: [successEmbed]
        });

    } catch (error) {
        console.error('❌ ブラウザ起動エラー:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ エラーが発生しました')
            .setDescription(`\`\`\`${error.message}\`\`\``)
            .setTimestamp();

        await safeEditReply(interaction, {
            content: null,
            embeds: [errorEmbed]
        });
    }
}

// ==================== メニュー管理ハンドラ ====================

async function handleMenuCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
        if (subcommand === 'add') {
            const name = interaction.options.getString('name');
            
            // メニュータイプを判定（PA/SAは特別な名前として扱う）
            // PASAの場合: PAとSAを同時に作成（1つのメッセージにまとめる）
            if (name.toUpperCase() === 'PASA') {
                // Private Account メニュー作成
                const paMenu = addMenu({
                    name: 'Private Account',
                    channelId: interaction.channelId,
                    hidden: false,
                    allowedRoles: [],
                    menuType: 'PA'
                });
                
                if (!paMenu) {
                    return interaction.editReply({
                        content: `❌ メニュー「Private Account」は既に存在します`
                    });
                }
                
                // Shared Account メニュー作成
                const saMenu = addMenu({
                    name: 'Shared Account',
                    channelId: interaction.channelId,
                    hidden: false,
                    allowedRoles: [],
                    menuType: 'SA'
                });
                
                if (!saMenu) {
                    return interaction.editReply({
                        content: `❌ メニュー「Shared Account」は既に存在します`
                    });
                }
                
                // 1つのメッセージに2つのドロップダウンをまとめて作成
                await createCombinedDropdownMenu(interaction, paMenu, saMenu);
                
                // 作成成功メッセージ
                await interaction.followUp({
                    content: `🔒 **Private Account** と 👥 **Shared Account** を作成しました`,
                    ephemeral: true
                });
                
                return;
            }
            
            // 通常の単一メニュー作成
            let menuType = 'standard';
            let displayName = name;
            
            if (name.toUpperCase() === 'PA') {
                menuType = 'PA';
                displayName = 'Private Account';
            } else if (name.toUpperCase() === 'SA') {
                menuType = 'SA';
                displayName = 'Shared Account';
            }
            
            const menu = addMenu({
                name: displayName,
                channelId: interaction.channelId,
                hidden: false,
                allowedRoles: [],
                menuType: menuType
            });
            
            if (!menu) {
                return interaction.editReply({
                    content: `❌ メニュー「${displayName}」は既に存在します`
                });
            }
            
            // 専用メニューの場合は特別なメッセージを表示
            const typeEmoji = menuType === 'PA' ? '🔒' : (menuType === 'SA' ? '👥' : '📋');
            const typeDesc = menuType === 'PA' 
                ? '専用アカウント用メニュー' 
                : (menuType === 'SA' ? '共有アカウント用メニュー' : '一般メニュー');
            
            // ドロップダウンメニューを作成して表示
            await createDropdownMenu(interaction, menu);
            
            // 作成成功メッセージを追加
            await interaction.followUp({
                content: `${typeEmoji} **${displayName}** (${typeDesc}) を作成しました`,
                ephemeral: true
            });
            
        } else if (subcommand === 'remove') {
            const name = interaction.options.getString('name');
            const menu = removeMenu(name);
            
            if (!menu) {
                return interaction.editReply({
                    content: `❌ メニュー「${name}」が見つかりません`
                });
            }
            
            // メッセージを削除
            try {
                const channel = await interaction.client.channels.fetch(menu.channelId);
                const message = await channel.messages.fetch(menu.messageId);
                await message.delete();
            } catch (e) {
                // メッセージが既に削除されている場合は無視
            }
            
            await interaction.editReply({
                content: `✅ メニュー「${name}」を削除しました`
            });
            
        } else if (subcommand === 'hide') {
            const name = interaction.options.getString('name');
            const role = interaction.options.getRole('role');
            
            const menu = setMenuVisibility(name, true, [role.id]);
            
            if (!menu) {
                return interaction.editReply({
                    content: `❌ メニュー「${name}」が見つかりません`
                });
            }
            
            await interaction.editReply({
                content: `✅ メニュー「${name}」を <@&${role.id}> のみ表示に設定しました`
            });
            
        } else if (subcommand === 'show') {
            const name = interaction.options.getString('name');
            
            const menu = setMenuVisibility(name, false, []);
            
            if (!menu) {
                return interaction.editReply({
                    content: `❌ メニュー「${name}」が見つかりません`
                });
            }
            
            await interaction.editReply({
                content: `✅ メニュー「${name}」を全員に表示するように設定しました`
            });
            
        } else if (subcommand === 'list') {
            const menus = getAllMenus();
            
            if (menus.length === 0) {
                return interaction.editReply({
                    content: '📋 メニューはまだ作成されていません'
                });
            }
            
            const menuList = menus.map(m => {
                const visibility = m.hidden ? `🔒 <@&${m.allowedRoles[0]}>のみ` : '🌐 全員';
                const typeIcon = m.menuType === 'PA' ? '🔒 PA' : (m.menuType === 'SA' ? '👥 SA' : '📋');
                return `• ${typeIcon} **${m.name}** (${visibility})`;
            }).join('\n');
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📋 メニュー一覧')
                .setDescription(menuList)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('❌ メニューコマンドエラー:', error);
        await interaction.editReply({
            content: `❌ エラーが発生しました: ${error.message}`
        });
    }
}

// ==================== Reloadハンドラ ====================

async function handleReloadCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const menus = getAllMenus();
        
        if (menus.length === 0) {
            return interaction.editReply({
                content: '📋 メニューは作成されていません'
            });
        }
        
        let updatedCount = 0;
        let errorCount = 0;
        
        // PASA（組み合わせメニュー）を先に処理
        const processedMessageIds = new Set();
        
        for (const menu of menus) {
            try {
                console.log(`[DEBUG] 処理中: ${menu.name}, messageId: ${menu.messageId}, menuType: ${menu.menuType}`);
                
                // 同じメッセージIDが既に処理済みならスキップ
                if (menu.messageId && processedMessageIds.has(menu.messageId)) {
                    console.log(`[DEBUG] スキップ: ${menu.name} は既に処理済み`);
                    continue;
                }
                
                // PASAかどうかチェック
                const sameMessageMenus = menus.filter(m => m.messageId === menu.messageId);
                const isCombined = sameMessageMenus.length >= 2 && 
                                  sameMessageMenus.some(m => m.menuType === 'PA') && 
                                  sameMessageMenus.some(m => m.menuType === 'SA');
                
                console.log(`[DEBUG] ${menu.name}: isCombined=${isCombined}, sameMessageMenus=${sameMessageMenus.length}`);
                
                if (isCombined) {
                    // PASAは一度だけ処理
                    const paMenu = sameMessageMenus.find(m => m.menuType === 'PA');
                    
                    console.log(`[DEBUG] PASA更新開始: ${paMenu.name}`);
                    // 両方のドロップダウンを更新
                    await updateMenuMessage(interaction, paMenu);
                    processedMessageIds.add(menu.messageId);
                    updatedCount++;
                    console.log(`[DEBUG] PASA更新完了`);
                } else {
                    // 単一メニュー
                    console.log(`[DEBUG] 単一メニュー更新開始: ${menu.name}`);
                    await updateMenuMessage(interaction, menu);
                    updatedCount++;
                    console.log(`[DEBUG] 単一メニュー更新完了`);
                }
            } catch (e) {
                console.error(`[ERROR] メニュー「${menu.name}」の更新エラー:`, e);
                errorCount++;
            }
        }
        
        const embed = new EmbedBuilder()
            .setColor(errorCount === 0 ? 0x00FF00 : 0xFFA500)
            .setTitle('🔄 メニュー更新完了')
            .setDescription(
                `✅ 更新成功: ${updatedCount}件\n` +
                (errorCount > 0 ? `❌ 更新失敗: ${errorCount}件\n` : '') +
                `\n全メニューを最新状態に更新しました`
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('❌ リロードエラー:', error);
        await interaction.editReply({
            content: `❌ エラーが発生しました: ${error.message}`
        });
    }
}

// ==================== Account管理ハンドラ ====================

async function handleAccountCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
        if (subcommand === 'available') {
            // Private Account (PA) の状況
            const paStats = getMenuAvailability('PA');
            // Shared Account (SA) の状況
            const saStats = getMenuAvailability('SA');
            
            // 各メニューの詳細を取得
            const menus = getAllMenus();
            
            // PAメニューの詳細
            const paMenus = menus.filter(m => m.menuType === 'PA');
            let paDetails = '';
            if (paMenus.length === 0) {
                paDetails = 'メニュー未作成';
            } else {
                paMenus.forEach(menu => {
                    const ws = getWorkspacesByMenu(menu.id);
                    const available = ws.reduce((sum, w) => sum + (w.maxSeats - w.usedSeats), 0);
                    paDetails += `• ${menu.name}: ${available}名参加可能\n`;
                });
            }
            
            // SAメニューの詳細
            const saMenus = menus.filter(m => m.menuType === 'SA');
            let saDetails = '';
            if (saMenus.length === 0) {
                saDetails = 'メニュー未作成';
            } else {
                saMenus.forEach(menu => {
                    const ws = getWorkspacesByMenu(menu.id);
                    const available = ws.reduce((sum, w) => sum + (w.maxSeats - w.usedSeats), 0);
                    saDetails += `• ${menu.name}: ${available}名参加可能\n`;
                });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📊 アカウント利用状況')
                .setDescription('現在のドロップダウンメニューの空き状況です')
                .addFields(
                    {
                        name: '🔒 Private Account（専用）',
                        value: paStats.availableSlots > 0 
                            ? `🟢 **${paStats.availableSlots}名** 参加可能\n\n${paDetails}`
                            : `🔴 **満席**\n\n${paDetails}`,
                        inline: true
                    },
                    {
                        name: '👥 Shared Account（共有）',
                        value: saStats.availableSlots > 0 
                            ? `🟢 **${saStats.availableSlots}名** 参加可能\n\n${saDetails}`
                            : `🔴 **満席**\n\n${saDetails}`,
                        inline: true
                    }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('❌ Accountコマンドエラー:', error);
        await interaction.editReply({
            content: `❌ エラーが発生しました: ${error.message}`
        });
    }
}

// ドロップダウンメニュー作成
async function createDropdownMenu(interaction, menu) {
    const { ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
    
    const workspaces = getWorkspacesByMenu(menu.id);
    
    // ドロップダウンオプション作成
    const options = [];
    
    if (workspaces.length === 0) {
        options.push({
            label: 'Workspaceがありません',
            description: '管理者に連絡してください',
            value: 'none',
            emoji: '⚠️'
        });
    } else {
        workspaces.forEach((ws, index) => {
            // 未アクティベーションのワークスペース
            if (ws.isActivated === false) {
                options.push({
                    label: `❌WorkSpace-${index + 1}`,
                    description: '未アクティベーション（使用不可）',
                    value: ws.id,
                    emoji: '🔒'
                });
                return;
            }
            
            const available = ws.maxSeats - ws.usedSeats;
            const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
            
            // ステータス色
            let emoji = '🟢';
            if (available === 0) emoji = '🔴';
            else if (available <= 1) emoji = '🟠';
            
            const roleLock = ws.restrictedRole ? '✨' : '';
            options.push({
                label: ws.restrictedRole ? `${roleLock}Premium Limited` : `Workspace-${index + 1}`,
                description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`,
                value: ws.id,
                emoji: emoji
            });
        });
    }
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`menu_${menu.id}`)
        .setPlaceholder('Workspaceを選択')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    // 統計情報を計算
    const paWorkspaces = workspaces.filter(w => w.isPrivate === true && w.isActivated !== false);
    const saWorkspaces = workspaces.filter(w => w.isPrivate !== true && w.isActivated !== false);
    const pendingWorkspaces = workspaces.filter(w => w.isActivated === false);
    
    // Private Account: 利用可能数 / 総数
    const paAvailable = paWorkspaces.filter(w => (w.maxSeats - w.usedSeats) > 0).length;
    const paTotal = paWorkspaces.length;
    
    // Shared Account: 空き席数 / 総席数
    const saAvailableSlots = saWorkspaces.reduce((sum, w) => sum + Math.max(0, w.maxSeats - w.usedSeats), 0);
    const saTotalSlots = saWorkspaces.reduce((sum, w) => sum + w.maxSeats, 0);
    
    // Pending Account: 未アクティベーション数
    const pendingTotal = pendingWorkspaces.length;
    
    // 全利用可能アカウント数
    const totalAvailableAccounts = paAvailable + saAvailableSlots;
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Select a workspace from the dropdown below')
        .setDescription(
            `🎫Available\n` +
            `${totalAvailableAccounts}Account\n\n` +
            `🔒Private Account　　👥Shared Account　　🚫Pending Account\n` +
            `　${paAvailable}/${paTotal}　　　　　　　　${saAvailableSlots}/${saTotalSlots}　　　　　　　　${pendingTotal}/${pendingTotal}`
        )
        .setTimestamp();
    
    // 権限設定
    const permissionOverwrites = [];
    if (menu.hidden && menu.allowedRoles.length > 0) {
        permissionOverwrites.push({
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
        });
        menu.allowedRoles.forEach(roleId => {
            permissionOverwrites.push({
                id: roleId,
                allow: [PermissionFlagsBits.ViewChannel]
            });
        });
    }
    
    const channel = await interaction.client.channels.fetch(menu.channelId);
    const message = await channel.send({
        embeds: [embed],
        components: [row]
    });
    
    // メッセージIDを保存
    updateMenuMessageId(menu.name, message.id);
    
    await interaction.editReply({
        content: `✅ メニュー「${menu.name}」を作成しました`
    });
}

// PAとSAを1つのメッセージにまとめて作成
async function createCombinedDropdownMenu(interaction, paMenu, saMenu) {
    const { ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
    
    // PAメニューのワークスペース
    const paWorkspaces = getWorkspacesByMenu(paMenu.id);
    const paOptions = [];
    
    if (paWorkspaces.length === 0) {
        paOptions.push({
            label: 'Workspaceがありません',
            description: '管理者に連絡してください',
            value: 'none',
            emoji: '⚠️'
        });
    } else {
        paWorkspaces.forEach((ws, index) => {
            if (ws.isActivated === false) {
                paOptions.push({
                    label: `❌WorkSpace-${index + 1}`,
                    description: '未アクティベーション（使用不可）',
                    value: ws.id,
                    emoji: '🔒'
                });
                return;
            }
            
            const available = ws.maxSeats - ws.usedSeats;
            const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
            let emoji = '🟢';
            if (available === 0) emoji = '🔴';
            else if (available <= 1) emoji = '🟠';
            
            paOptions.push({
                label: `Workspace-${index + 1}`,
                description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`,
                value: ws.id,
                emoji: emoji
            });
        });
    }
    
    // SAメニューのワークスペース
    const saWorkspaces = getWorkspacesByMenu(saMenu.id);
    const saOptions = [];
    
    if (saWorkspaces.length === 0) {
        saOptions.push({
            label: 'Workspaceがありません',
            description: '管理者に連絡してください',
            value: 'none',
            emoji: '⚠️'
        });
    } else {
        saWorkspaces.forEach((ws, index) => {
            if (ws.isActivated === false) {
                saOptions.push({
                    label: `❌WorkSpace-${index + 1}`,
                    description: '未アクティベーション（使用不可）',
                    value: ws.id,
                    emoji: '🔒'
                });
                return;
            }
            
            const available = ws.maxSeats - ws.usedSeats;
            const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
            let emoji = '🟢';
            if (available === 0) emoji = '🔴';
            else if (available <= 1) emoji = '🟠';
            
            saOptions.push({
                label: `Workspace-${index + 1}`,
                description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`,
                value: ws.id,
                emoji: emoji
            });
        });
    }
    
    // PAドロップダウン
    const paSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`menu_${paMenu.id}`)
        .setPlaceholder('🔒 Private Accountを選択')
        .addOptions(paOptions);
    
    const paRow = new ActionRowBuilder().addComponents(paSelectMenu);
    
    // SAドロップダウン
    const saSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`menu_${saMenu.id}`)
        .setPlaceholder('👥 Shared Accountを選択')
        .addOptions(saOptions);
    
    const saRow = new ActionRowBuilder().addComponents(saSelectMenu);
    
    // 統計情報を計算（両方のメニュー合計）
    const allWorkspaces = [...paWorkspaces, ...saWorkspaces];
    const paActive = paWorkspaces.filter(w => w.isPrivate === true && w.isActivated !== false);
    const saActive = saWorkspaces.filter(w => w.isPrivate !== true && w.isActivated !== false);
    const pendingAll = allWorkspaces.filter(w => w.isActivated === false);
    
    const paAvailable = paActive.filter(w => (w.maxSeats - w.usedSeats) > 0).length;
    const paTotal = paActive.length;
    
    const saAvailableSlots = saActive.reduce((sum, w) => sum + Math.max(0, w.maxSeats - w.usedSeats), 0);
    const saTotalSlots = saActive.reduce((sum, w) => sum + w.maxSeats, 0);
    
    const pendingTotal = pendingAll.length;
    const totalAvailableAccounts = paAvailable + saAvailableSlots;
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Select a workspace from the dropdown below')
        .setDescription(
            `🎫Available\n` +
            `${totalAvailableAccounts}Account\n\n` +
            `🔒Private Account　　👥Shared Account　　🚫Pending Account\n` +
            `　${paAvailable}/${paTotal}　　　　　　　　${saAvailableSlots}/${saTotalSlots}　　　　　　　　${pendingTotal}/${pendingTotal}`
        )
        .setTimestamp();
    
    // 権限設定
    const permissionOverwrites = [];
    if (paMenu.hidden && paMenu.allowedRoles.length > 0) {
        permissionOverwrites.push({
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
        });
        paMenu.allowedRoles.forEach(roleId => {
            permissionOverwrites.push({
                id: roleId,
                allow: [PermissionFlagsBits.ViewChannel]
            });
        });
    }
    
    const channel = await interaction.client.channels.fetch(paMenu.channelId);
    const message = await channel.send({
        embeds: [embed],
        components: [paRow, saRow]
    });
    
    // 両方のメッセージIDを保存
    updateMenuMessageId(paMenu.name, message.id);
    updateMenuMessageId(saMenu.name, message.id);
    
    await interaction.editReply({
        content: `✅ メニュー「Private Account」と「Shared Account」を作成しました`
    });
}

// メニューの選択をリセットする関数
async function resetMenuSelection(interaction, menuId) {
    try {
        const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
        const menu = getAllMenus().find(m => m.id === menuId);
        if (!menu) return;
        
        // PASAの場合: 同じメッセージにPAとSAの両方があるか確認
        const allMenus = getAllMenus();
        const sameMessageMenus = allMenus.filter(m => m.messageId === menu.messageId);
        const isCombined = sameMessageMenus.length >= 2 && 
                          sameMessageMenus.some(m => m.menuType === 'PA') && 
                          sameMessageMenus.some(m => m.menuType === 'SA');
        
        if (isCombined) {
            const paMenu = sameMessageMenus.find(m => m.menuType === 'PA');
            const saMenu = sameMessageMenus.find(m => m.menuType === 'SA');
            
            // PAオプション
            const paWorkspaces = getWorkspacesByMenu(paMenu.id);
            const paOptions = [];
            if (paWorkspaces.length === 0) paOptions.push({ label: 'Workspaceがありません', description: '管理者に連絡してください', value: 'none', emoji: '⚠️' });
            else {
                paWorkspaces.forEach((ws, index) => {
                    if (ws.isActivated === false) { paOptions.push({ label: `❌WorkSpace-${index + 1}`, description: '未アクティベーション', value: ws.id, emoji: '🔒' }); return; }
                    const available = ws.maxSeats - ws.usedSeats;
                    const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
                    let emoji = '🟢'; if (available === 0) emoji = '🔴'; else if (available <= 1) emoji = '🟠';
                    const roleLock = ws.restrictedRole ? '✨' : '';
                    paOptions.push({ label: ws.restrictedRole ? `${roleLock}Premium Limited` : `Workspace-${index + 1}`, description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`, value: ws.id, emoji: emoji });
                });
            }
            
            // SAオプション
            const saWorkspaces = getWorkspacesByMenu(saMenu.id);
            const saOptions = [];
            if (saWorkspaces.length === 0) saOptions.push({ label: 'Workspaceがありません', description: '管理者に連絡してください', value: 'none', emoji: '⚠️' });
            else {
                saWorkspaces.forEach((ws, index) => {
                    if (ws.isActivated === false) { saOptions.push({ label: `❌WorkSpace-${index + 1}`, description: '未アクティベーション', value: ws.id, emoji: '🔒' }); return; }
                    const available = ws.maxSeats - ws.usedSeats;
                    const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
                    let emoji = '🟢'; if (available === 0) emoji = '🔴'; else if (available <= 1) emoji = '🟠';
                    const roleLock = ws.restrictedRole ? '✨' : '';
                    saOptions.push({ label: ws.restrictedRole ? `${roleLock}Premium Limited` : `Workspace-${index + 1}`, description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`, value: ws.id, emoji: emoji });
                });
            }
            
            const paSelectMenu = new StringSelectMenuBuilder().setCustomId(`menu_${paMenu.id}`).setPlaceholder('🔒 Private Accountを選択').addOptions(paOptions);
            const paRow = new ActionRowBuilder().addComponents(paSelectMenu);
            const saSelectMenu = new StringSelectMenuBuilder().setCustomId(`menu_${saMenu.id}`).setPlaceholder('👥 Shared Accountを選択').addOptions(saOptions);
            const saRow = new ActionRowBuilder().addComponents(saSelectMenu);
            
            const allWorkspaces = [...paWorkspaces, ...saWorkspaces];
            const paActive = paWorkspaces.filter(w => w.isPrivate === true && w.isActivated !== false);
            const saActive = saWorkspaces.filter(w => w.isPrivate !== true && w.isActivated !== false);
            const pendingAll = allWorkspaces.filter(w => w.isActivated === false);
            
            const paAvailable = paActive.filter(w => (w.maxSeats - w.usedSeats) > 0).length;
            const paTotal = paActive.length;
            const saAvailableSlots = saActive.reduce((sum, w) => sum + Math.max(0, w.maxSeats - w.usedSeats), 0);
            const saTotalSlots = saActive.reduce((sum, w) => sum + w.maxSeats, 0);
            const pendingTotal = pendingAll.length;
            const totalAvailableAccounts = paAvailable + saAvailableSlots;
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Select a workspace from the dropdown below')
                .setDescription(
                    `🎫Available\n` +
                    `${totalAvailableAccounts}Account\n\n` +
                    `🔒Private Account　　👥Shared Account　　🚫Pending Account\n` +
                    `　${paAvailable}/${paTotal}　　　　　　　　${saAvailableSlots}/${saTotalSlots}　　　　　　　　${pendingTotal}/${pendingTotal}`
                )
                .setTimestamp();
            
            await interaction.update({ embeds: [embed], components: [paRow, saRow] });
            return;
        }
        
        // 単一メニュー（従来通り）
        const workspaces = getWorkspacesByMenu(menuId);
        const options = [];
        
        if (workspaces.length === 0) {
            options.push({ label: 'Workspaceがありません', description: '管理者に連絡してください', value: 'none', emoji: '⚠️' });
        } else {
            workspaces.forEach((ws, index) => {
                if (ws.isActivated === false) { options.push({ label: `❌WorkSpace-${index + 1}`, description: '未アクティベーション（使用不可）', value: ws.id, emoji: '🔒' }); return; }
                const available = ws.maxSeats - ws.usedSeats;
                const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
                let emoji = '🟢'; if (available === 0) emoji = '🔴'; else if (available <= 1) emoji = '🟠';
                const roleLock = ws.restrictedRole ? '✨' : '';
                options.push({ label: ws.restrictedRole ? `${roleLock}Premium Limited` : `Workspace-${index + 1}`, description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`, value: ws.id, emoji: emoji });
            });
        }
        
        const selectMenu = new StringSelectMenuBuilder().setCustomId(`menu_${menuId}`).setPlaceholder('Workspaceを選択').addOptions(options);
        const row = new ActionRowBuilder().addComponents(selectMenu);
        
        const paWorkspaces = workspaces.filter(w => w.isPrivate === true && w.isActivated !== false);
        const saWorkspaces = workspaces.filter(w => w.isPrivate !== true && w.isActivated !== false);
        const pendingWorkspaces = workspaces.filter(w => w.isActivated === false);
        
        const paAvailable = paWorkspaces.filter(w => (w.maxSeats - w.usedSeats) > 0).length;
        const paTotal = paWorkspaces.length;
        const saAvailableSlots = saWorkspaces.reduce((sum, w) => sum + Math.max(0, w.maxSeats - w.usedSeats), 0);
        const saTotalSlots = saWorkspaces.reduce((sum, w) => sum + w.maxSeats, 0);
        const pendingTotal = pendingWorkspaces.length;
        const totalAvailableAccounts = paAvailable + saAvailableSlots;
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Select a workspace from the dropdown below')
            .setDescription(
                `🎫Available\n` +
                `${totalAvailableAccounts}Account\n\n` +
                `🔒Private Account　　👥Shared Account　　🚫Pending Account\n` +
                `　${paAvailable}/${paTotal}　　　　　　　　${saAvailableSlots}/${saTotalSlots}　　　　　　　　${pendingTotal}/${pendingTotal}`
            )
            .setTimestamp();
        
        await interaction.update({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('メニューリセットエラー:', error);
    }
}

// ==================== Workspace管理ハンドラ ====================

async function handleWorkspaceCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const subcommandGroup = interaction.options.getSubcommandGroup();
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
        // アクティベーションサブコマンド
        if (subcommand === 'activation') {
            const email = interaction.options.getString('email');
            const password = interaction.options.getString('password');
            
            await interaction.editReply({
                content: `🔄 Workspace無料オファー有効化を開始します...\n📧 Workspace: \`${email}\``
            });
            
            try {
                const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
                const scriptPath = path.join(__dirname, 'puppeteer_activation.js');
                
                let stdout = '';
                let stderr = '';
                
                const child = spawn(nodePath, [
                    scriptPath,
                    email,
                    password
                ], {
                    env: { 
                        ...process.env, 
                        PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH
                    }
                });
                
                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                    console.log(data.toString());
                });
                
                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                    console.error(data.toString());
                });
                
                child.on('close', async (code) => {
                    if (code === 0) {
                        // ワークスペースをアクティベート
                        const activatedWorkspace = activateWorkspaceByEmail(email);
                        
                        // メニューを更新（アクティベートしたワークスペースが属するメニュー）
                        let menuUpdated = false;
                        if (activatedWorkspace && activatedWorkspace.menuId) {
                            try {
                                const menu = getAllMenus().find(m => m.id === activatedWorkspace.menuId);
                                if (menu) {
                                    await updateMenuMessage(interaction, menu);
                                    menuUpdated = true;
                                    console.log(`[DEBUG] メニュー「${menu.name}」を更新しました`);
                                }
                            } catch (menuError) {
                                console.error('[ERROR] メニュー更新エラー:', menuError);
                            }
                        }
                        
                        const embed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('✅ 無料オファー有効化完了')
                            .setDescription(
                                `🎉 1ヶ月無料オファーが有効化されました！\n\n` +
                                `📧 Workspace: \`${email}\`` +
                                (menuUpdated ? '\n\n📋 ドロップダウンメニューを更新しました' : '')
                            )
                            .setTimestamp();
                        
                        await interaction.editReply({ embeds: [embed] });
                    } else {
                        // エラー時にログを表示
                        const errorLog = stderr || stdout || '詳細不明';
                        const truncatedLog = errorLog.length > 1800 ? errorLog.slice(-1800) : errorLog;
                        
                        const embed = new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle('❌ 無料オファー有効化に失敗しました')
                            .setDescription(
                                `📧 Workspace: \`${email}\`\n\n` +
                                `**エラーログ:**\n\`\`\`\n${truncatedLog}\n\`\`\``
                            )
                            .setTimestamp();
                        
                        await interaction.editReply({ embeds: [embed] });
                    }
                });
                
            } catch (error) {
                console.error('❌ アクティベーションエラー:', error);
                await interaction.editReply({
                    content: `❌ エラーが発生しました: ${error.message}`
                });
            }
            return;
        }
        
        // アカウント管理サブコマンド
        if (subcommandGroup === 'account') {
            if (subcommand === 'add') {
                const name = interaction.options.getString('name');
                const email = interaction.options.getString('email');
                const password = interaction.options.getString('password');
                
                const account = addAccount(name, email, password);
                
                if (!account) {
                    return interaction.editReply({
                        content: `❌ アカウント名「${name}」は既に存在します`
                    });
                }
                
                await interaction.editReply({
                    content: `✅ アカウント「${name}」を追加しました\n📧 ${email}`
                });
                
            } else if (subcommand === 'remove') {
                const name = interaction.options.getString('name');
                const account = removeAccount(name);
                
                if (!account) {
                    return interaction.editReply({
                        content: `❌ アカウント「${name}」が見つかりません`
                    });
                }
                
                await interaction.editReply({
                    content: `✅ アカウント「${name}」を削除しました`
                });
                
            } else if (subcommand === 'list') {
                const accounts = getAllAccounts();
                
                if (accounts.length === 0) {
                    return interaction.editReply({
                        content: '📋 アカウントは登録されていません'
                    });
                }
                
                const config = loadAccounts();
                const accountList = accounts.map(a => {
                    const isDefault = config.default_account === a.name ? ' ⭐' : '';
                    return `• **${a.name}**${isDefault}\n  📧 \`${a.email}\``;
                }).join('\n\n');
                
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('📋 アカウント一覧')
                    .setDescription(accountList)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
            }
            return;
        }
        
        // 通常のWorkspace管理
        if (subcommand === 'add') {
            const email = interaction.options.getString('email');
            const password = interaction.options.getString('password');
            const menuName = interaction.options.getString('menu');
            const seats = interaction.options.getInteger('seats') || 4;
            const expiry = interaction.options.getInteger('expiry') || 30;
            
            let menuId = null;
            if (menuName) {
                const menu = getMenuByName(menuName);
                if (!menu) {
                    return interaction.editReply({
                        content: `❌ メニュー「${menuName}」が見つかりません`
                    });
                }
                menuId = menu.id;
            }
            
            const workspace = addWorkspace({
                name: `Workspace-${Date.now().toString(36).substr(-4)}`,
                email: email,
                password: password,
                maxSeats: seats,
                expiryDays: expiry,
                menuId: menuId
            });
            
            // メニューが指定されていれば更新
            if (menuId) {
                const menu = getMenuByName(menuName);
                await updateMenuMessage(interaction, menu);
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Workspaceを追加しました')
                .addFields(
                    { name: '🆔 ID', value: workspace.id, inline: true },
                    { name: '📧 メール', value: email, inline: true },
                    { name: '👥 席数', value: `${seats}席`, inline: true },
                    { name: '⏰ 有効期限', value: `${expiry}日`, inline: true },
                    { name: '📁 メニュー', value: menuName || '未設定', inline: true }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } else if (subcommand === 'list') {
            const workspaces = getAllWorkspaces();
            
            if (workspaces.length === 0) {
                return interaction.editReply({
                    content: '📋 Workspaceはまだ登録されていません'
                });
            }
            
            const wsList = workspaces.map(ws => {
                const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
                const available = ws.maxSeats - ws.usedSeats;
                let status = '🟢';
                if (ws.status === 'full') status = '🔴';
                else if (ws.status === 'expired') status = '⚫';
                else if (available <= 1) status = '🟠';
                
                return `${status} **${ws.name}** | 空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日\n   🆔 \`${ws.id}\` | 📧 \`${ws.email}\``;
            }).join('\n\n');
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📋 Workspace一覧')
                .setDescription(wsList)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } else if (subcommand === 'remove') {
            const id = interaction.options.getString('id');
            
            if (removeWorkspace(id)) {
                await interaction.editReply({
                    content: `✅ Workspace \`${id}\` を削除しました`
                });
            } else {
                await interaction.editReply({
                    content: `❌ Workspace \`${id}\` が見つかりません`
                });
            }
        }
    } catch (error) {
        console.error('❌ Workspaceコマンドエラー:', error);
        await interaction.editReply({
            content: `❌ エラーが発生しました: ${error.message}`
        });
    }
}

// メニューメッセージ更新
async function updateMenuMessage(interaction, menu) {
    try {
        const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
        
        // PASAの場合: 同じメッセージにPAとSAの両方があるか確認
        const allMenus = getAllMenus();
        const sameMessageMenus = allMenus.filter(m => m.messageId === menu.messageId);
        const isCombined = sameMessageMenus.length >= 2 && 
                          sameMessageMenus.some(m => m.menuType === 'PA') && 
                          sameMessageMenus.some(m => m.menuType === 'SA');
        
        if (isCombined) {
            // PAとSAを同時に更新
            const paMenu = sameMessageMenus.find(m => m.menuType === 'PA');
            const saMenu = sameMessageMenus.find(m => m.menuType === 'SA');
            
            // PAオプション
            const paWorkspaces = getWorkspacesByMenu(paMenu.id);
            const paOptions = [];
            if (paWorkspaces.length === 0) {
                paOptions.push({ label: 'Workspaceがありません', description: '管理者に連絡してください', value: 'none', emoji: '⚠️' });
            } else {
                paWorkspaces.forEach((ws, index) => {
                    if (ws.isActivated === false) {
                        paOptions.push({ label: `❌WorkSpace-${index + 1}`, description: '未アクティベーション', value: ws.id, emoji: '🔒' });
                        return;
                    }
                    const available = ws.maxSeats - ws.usedSeats;
                    const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
                    let emoji = '🟢'; if (available === 0) emoji = '🔴'; else if (available <= 1) emoji = '🟠';
                    const roleLock = ws.restrictedRole ? '✨' : '';
                    paOptions.push({ label: ws.restrictedRole ? `${roleLock}Premium Limited` : `Workspace-${index + 1}`, description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`, value: ws.id, emoji: emoji });
                });
            }
            
            // SAオプション
            const saWorkspaces = getWorkspacesByMenu(saMenu.id);
            const saOptions = [];
            if (saWorkspaces.length === 0) {
                saOptions.push({ label: 'Workspaceがありません', description: '管理者に連絡してください', value: 'none', emoji: '⚠️' });
            } else {
                saWorkspaces.forEach((ws, index) => {
                    if (ws.isActivated === false) {
                        saOptions.push({ label: `❌WorkSpace-${index + 1}`, description: '未アクティベーション', value: ws.id, emoji: '🔒' });
                        return;
                    }
                    const available = ws.maxSeats - ws.usedSeats;
                    const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
                    let emoji = '🟢'; if (available === 0) emoji = '🔴'; else if (available <= 1) emoji = '🟠';
                    const roleLock = ws.restrictedRole ? '✨' : '';
                    saOptions.push({ label: ws.restrictedRole ? `${roleLock}Premium Limited` : `Workspace-${index + 1}`, description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`, value: ws.id, emoji: emoji });
                });
            }
            
            // ドロップダウン作成
            const paSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`menu_${paMenu.id}`)
                .setPlaceholder('🔒 Private Accountを選択')
                .addOptions(paOptions);
            const paRow = new ActionRowBuilder().addComponents(paSelectMenu);
            
            const saSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`menu_${saMenu.id}`)
                .setPlaceholder('👥 Shared Accountを選択')
                .addOptions(saOptions);
            const saRow = new ActionRowBuilder().addComponents(saSelectMenu);
            
            // 統計情報
            const allWorkspaces = [...paWorkspaces, ...saWorkspaces];
            console.log(`[DEBUG] updateMenuMessage: PA workspaces=${paWorkspaces.length}, SA workspaces=${saWorkspaces.length}`);
            console.log(`[DEBUG] All workspaces:`, allWorkspaces.map(w => ({ id: w.id, isActivated: w.isActivated, menuId: w.menuId })));
            
            const paActive = paWorkspaces.filter(w => w.isPrivate === true && w.isActivated !== false);
            const saActive = saWorkspaces.filter(w => w.isPrivate !== true && w.isActivated !== false);
            const pendingAll = allWorkspaces.filter(w => w.isActivated === false);
            
            console.log(`[DEBUG] pendingAll count=${pendingAll.length}, pendingAll:`, pendingAll.map(w => ({ id: w.id, isActivated: w.isActivated })));
            
            const paAvailable = paActive.filter(w => (w.maxSeats - w.usedSeats) > 0).length;
            const paTotal = paActive.length;
            const saAvailableSlots = saActive.reduce((sum, w) => sum + Math.max(0, w.maxSeats - w.usedSeats), 0);
            const saTotalSlots = saActive.reduce((sum, w) => sum + w.maxSeats, 0);
            const pendingTotal = pendingAll.length;
            
            console.log(`[DEBUG] pendingTotal=${pendingTotal}`);
            const totalAvailableAccounts = paAvailable + saAvailableSlots;
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Select a workspace from the dropdown below')
                .setDescription(
                    `🎫Available\n` +
                    `${totalAvailableAccounts}Account\n\n` +
                    `🔒Private Account　　👥Shared Account　　🚫Pending Account\n` +
                    `　${paAvailable}/${paTotal}　　　　　　　　${saAvailableSlots}/${saTotalSlots}　　　　　　　　${pendingTotal}/${pendingTotal}`
                )
                .setTimestamp();
            
            const channel = await interaction.client.channels.fetch(paMenu.channelId);
            const message = await channel.messages.fetch(paMenu.messageId);
            
            await message.edit({ embeds: [embed], components: [paRow, saRow] });
            return;
        }
        
        // 単一メニューの更新（従来通り）
        const workspaces = getWorkspacesByMenu(menu.id);
        
        const options = [];
        if (workspaces.length === 0) {
            options.push({ label: 'Workspaceがありません', description: '管理者に連絡してください', value: 'none', emoji: '⚠️' });
        } else {
            workspaces.forEach((ws, index) => {
                if (ws.isActivated === false) {
                    options.push({ label: `❌WorkSpace-${index + 1}`, description: '未アクティベーション（使用不可）', value: ws.id, emoji: '🔒' });
                    return;
                }
                const available = ws.maxSeats - ws.usedSeats;
                const daysLeft = Math.ceil((new Date(ws.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
                let emoji = '🟢'; if (available === 0) emoji = '🔴'; else if (available <= 1) emoji = '🟠';
                const roleLock = ws.restrictedRole ? '✨' : '';
                options.push({ label: ws.restrictedRole ? `${roleLock}Premium Limited` : `Workspace-${index + 1}`, description: `空き: ${available}/${ws.maxSeats} | 残り${daysLeft}日`, value: ws.id, emoji: emoji });
            });
        }
        
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`menu_${menu.id}`)
            .setPlaceholder('Workspaceを選択')
            .addOptions(options);
        const row = new ActionRowBuilder().addComponents(selectMenu);
        
        const paWorkspaces = workspaces.filter(w => w.isPrivate === true && w.isActivated !== false);
        const saWorkspaces = workspaces.filter(w => w.isPrivate !== true && w.isActivated !== false);
        const pendingWorkspaces = workspaces.filter(w => w.isActivated === false);
        
        const paAvailable = paWorkspaces.filter(w => (w.maxSeats - w.usedSeats) > 0).length;
        const paTotal = paWorkspaces.length;
        const saAvailableSlots = saWorkspaces.reduce((sum, w) => sum + Math.max(0, w.maxSeats - w.usedSeats), 0);
        const saTotalSlots = saWorkspaces.reduce((sum, w) => sum + w.maxSeats, 0);
        const pendingTotal = pendingWorkspaces.length;
        const totalAvailableAccounts = paAvailable + saAvailableSlots;
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('Select a workspace from the dropdown below')
            .setDescription(
                `🎫Available\n` +
                `${totalAvailableAccounts}Account\n\n` +
                `🔒Private Account　　👥Shared Account　　🚫Pending Account\n` +
                `　${paAvailable}/${paTotal}　　　　　　　　${saAvailableSlots}/${saTotalSlots}　　　　　　　　${pendingTotal}/${pendingTotal}`
            )
            .setTimestamp();
        
        const channel = await interaction.client.channels.fetch(menu.channelId);
        console.log(`[DEBUG] チャンネル取得: ${channel.name}`);
        
        const message = await channel.messages.fetch(menu.messageId);
        console.log(`[DEBUG] メッセージ取得: ${message.id}`);
        
        await message.edit({ embeds: [embed], components: [row] });
        console.log(`[DEBUG] メッセージ編集完了`);
    } catch (e) {
        console.error(`[ERROR] メニュー「${menu.name}」更新エラー:`, e.message);
        throw e;
    }
}

// ==================== Activationハンドラ ====================

// アクティブな招待プロセスを管理
const activeInvitations = new Map();

async function handleActivationCommand(interaction) {
    await interaction.deferReply({ ephemeral: false }); // チャンネル全员に見える
    
    const subcommand = interaction.options.getSubcommand();
    
    // cancel サブコマンド
    if (subcommand === 'cancel') {
        const userId = interaction.user.id;
        const child = activeInvitations.get(userId);
        
        if (!child) {
            return interaction.editReply({
                content: '❌ 実行中の招待処理が見つかりません'
            });
        }
        
        // プロセスを終了
        child.kill('SIGTERM');
        activeInvitations.delete(userId);
        
        return interaction.editReply({
            content: '✅ 招待処理をキャンセルしました'
        });
    }
    
    // send サブコマンド（デフォルト）
    try {
        // チケットチャンネルかどうか確認
        const ticket = getTicketByUser(interaction.user.id);
        
        // チケットが見つからない場合は、チャンネル名で判定（バックアップ）
        const isTicketChannel = interaction.channel.name.startsWith('ticket-');
        
        if (!ticket && !isTicketChannel) {
            return interaction.editReply({
                content: '❌ このコマンドはチケットチャンネルでのみ使用できます'
            });
        }
        
        // チケットが見つからないがチケットチャンネルの場合は、全チケットから探す
        let actualTicket = ticket;
        if (!actualTicket && isTicketChannel) {
            const allTickets = Object.values(require('./workspace_manager').getAllTickets?.() || {});
            actualTicket = allTickets.find(t => t.channelId === interaction.channelId);
        }
        
        if (!actualTicket) {
            return interaction.editReply({
                content: '❌ チケット情報が見つかりません'
            });
        }
        
        const email = interaction.options.getString('email');
        const workspace = getAllWorkspaces().find(w => w.id === actualTicket.workspaceId);
        
        if (!workspace) {
            return interaction.editReply({
                content: '❌ Workspaceが見つかりません'
            });
        }
        
        // メンバーを追加
        const updated = addMemberToWorkspace(workspace.id, email);
        
        if (!updated) {
            return interaction.editReply({
                content: '❌ このWorkspaceは満席です'
            });
        }
        
        // 自動招待処理開始
        await interaction.editReply({
            content: `🔄 招待を自動処理中です...\n📧 招待先: \`${email}\`\n⏳ しばらくお待ちください...`
        });
        
        // Puppeteerスクリプトを実行
        const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
        const scriptPath = path.join(__dirname, 'puppeteer_invite.js');
        
        const child = spawn(nodePath, [
            scriptPath,
            workspace.email,
            workspace.password,
            email
        ], {
            env: { 
                ...process.env, 
                PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                HEADLESS: 'false' // 画面表示あり（確認用）
            }
        });
        
        // アクティブな招待として保存
        activeInvitations.set(interaction.user.id, child);
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log(data.toString());
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(data.toString());
        });
        
        child.on('close', async (code) => {
            // アクティブな招待から削除
            activeInvitations.delete(interaction.user.id);
            if (code === 0) {
                // 成功
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ 招待完了')
                    .setDescription(
                        `📧 招待先: \`${email}\`\n\n` +
                        `🎉 ChatGPT Workspaceへの招待が完了しました！\n\n` +
                        `招待メールが送信されたはずです。\n` +
                        `メールが届かない場合は、迷惑メールフォルダもご確認ください。`
                    )
                    .setTimestamp();
                
                await interaction.channel.send({ embeds: [embed] });
                
                // チケットをクローズ
                closeTicket(ticket.id);
                
                // 少し待ってからチャンネルを削除
                setTimeout(async () => {
                    try {
                        await interaction.channel.delete('招待完了のため');
                    } catch (e) {
                        console.error('チャンネル削除エラー:', e);
                    }
                }, 10000); // 10秒後に削除
                
            } else {
                // 失敗
                console.error('招待スクリプトエラー:', stderr);
                
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('⚠️ 自動招待に失敗しました')
                    .setDescription(
                        `自動処理が失敗したため、手動で招待をお願いします。\n\n` +
                        `📧 招待先: \`${email}\`\n\n` +
                        `手順:\n` +
                        `1. [ChatGPT](https://chatgpt.com/auth/login) を開く\n` +
                        `2. メール: \`${workspace.email}\`\n` +
                        `3. パスワード: \`${workspace.password}\`\n` +
                        `4. 「メンバーを招待」→ \`${email}\` を入力\n\n` +
                        `エラー詳細:\n\`\`\`${stderr.slice(-500)}\`\`\``
                    )
                    .setTimestamp();
                
                await interaction.channel.send({ embeds: [embed] });
            }
            
            // メニューを更新
            if (workspace.menuId) {
                const menus = getAllMenus();
                const menu = menus.find(m => m.id === workspace.menuId);
                if (menu) {
                    const mockInteraction = { client: interaction.client, guild: interaction.guild };
                    await updateMenuMessage(mockInteraction, menu);
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Activationエラー:', error);
        await interaction.editReply({
            content: `❌ エラーが発生しました: ${error.message}`
        });
    }
}

// ==================== ドロップダウン選択ハンドラ ====================

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    
    if (interaction.customId.startsWith('menu_')) {
        const workspaceId = interaction.values[0];
        const menuId = interaction.customId.replace('menu_', '');
        
        if (workspaceId === 'none') {
            // メニューをリセットして更新
            await resetMenuSelection(interaction, menuId);
            return interaction.followUp({
                content: '⚠️ 利用可能なWorkspaceがありません',
                ephemeral: true
            });
        }
        
        const workspace = getAllWorkspaces().find(w => w.id === workspaceId);
        if (!workspace) {
            await resetMenuSelection(interaction, menuId);
            return interaction.followUp({
                content: '❌ Workspaceが見つかりません',
                ephemeral: true
            });
        }
        
        // 未アクティベーションチェック
        if (workspace.isActivated === false) {
            await resetMenuSelection(interaction, menuId);
            return interaction.followUp({
                content: '❌このワークスペースは、アクティベーションされていません。',
                ephemeral: true
            });
        }
        
        // ロール制限チェック
        if (workspace.restrictedRole) {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.has(workspace.restrictedRole)) {
                await resetMenuSelection(interaction, menuId);
                return interaction.followUp({
                    content: '🔒 このワークスペースは特定のロールを持つメンバーのみ利用できます。',
                    ephemeral: true
                });
            }
        }
        
        if (workspace.usedSeats >= workspace.maxSeats) {
            await resetMenuSelection(interaction, menuId);
            return interaction.followUp({
                content: '❌ このWorkspaceは満席です',
                ephemeral: true
            });
        }
        
        // 既存チケット確認
        const existingTicket = getTicketByUser(interaction.user.id);
        if (existingTicket) {
            await resetMenuSelection(interaction, menuId);
            return interaction.followUp({
                content: `⚠️ 既にチケットを発行済みです: <#${existingTicket.channelId}>`,
                ephemeral: true
            });
        }
        
        try {
            // 一時チャンネル作成
            const { PermissionFlagsBits } = require('discord.js');
            
            const channel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: 0, // テキストチャンネル
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                    },
                    {
                        id: client.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                    }
                ]
            });
            
            // チケット保存
            createTicket({
                userId: interaction.user.id,
                username: interaction.user.username,
                workspaceId: workspaceId,
                channelId: channel.id
            });
            
            // チャンネルに案内メッセージ
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🎫 チケット発行完了')
                .setDescription(
                    `<@${interaction.user.id}> さんのチケットです\n\n` +
                    `📧 招待したいメールアドレスを教えてください\n` +
                    `準備ができたら "/activation [メールアドレス]" を実行してください\n\n` +
                    `終了したら以下のボタンを押してチケットを閉じてください`
                )
                .setTimestamp();
            
            // チケット閉じるボタン
            const closeButton = new ButtonBuilder()
                .setCustomId(`close_ticket_${channel.id}`)
                .setLabel('🔒 チケットを閉じる')
                .setStyle(ButtonStyle.Danger);
            
            const row = new ActionRowBuilder().addComponents(closeButton);
            
            await channel.send({ embeds: [embed], components: [row] });
            
            // メニューをリセットしてから返信
            await resetMenuSelection(interaction, menuId);
            await interaction.followUp({
                content: `✅ チケットを発行しました: ${channel}`,
                ephemeral: true
            });
            
        } catch (error) {
            console.error('❌ チケット作成エラー:', error);
            await resetMenuSelection(interaction, menuId);
            await interaction.followUp({
                content: `❌ チケット作成に失敗しました: ${error.message}`,
                ephemeral: true
            });
        }
    }
});

// ==================== Ticket管理ハンドラ ====================

async function handleTicketCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
        if (subcommand === 'reset') {
            // 管理者権限チェック（オプション）
            // if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            //     return interaction.editReply({ content: '❌ 管理者権限が必要です' });
            // }
            
            const count = resetAllTickets();
            
            await interaction.editReply({
                content: `✅ 全チケット情報をリセットしました\n🗑️ 削除件数: ${count}件`
            });
            
        } else if (subcommand === 'myclear') {
            const removed = removeUserTicket(interaction.user.id);
            
            if (removed > 0) {
                await interaction.editReply({
                    content: `✅ あなたのチケットを削除しました`
                });
            } else {
                await interaction.editReply({
                    content: `ℹ️ 削除するチケットがありません`
                });
            }
        }
    } catch (error) {
        console.error('❌ Ticketコマンドエラー:', error);
        await interaction.editReply({
            content: `❌ エラーが発生しました: ${error.message}`
        });
    }
}

// ==================== ボタン処理 ====================

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    // チケット閉じるボタン
    if (interaction.customId.startsWith('close_ticket_')) {
        try {
            // まず応答を送信（チャンネル削除前に）
            await interaction.reply({
                content: '✅ チケットを閉じています...',
                ephemeral: true
            });
            
            // チケット情報を削除
            const { closeTicket } = require('./workspace_manager');
            
            // 現在のチャンネルからチケットを特定して削除
            const channel = interaction.channel;
            if (channel.name.startsWith('ticket-')) {
                // チャンネル名からユーザー名を取得
                const username = channel.name.replace('ticket-', '');
                // メンバーを検索
                const member = interaction.guild.members.cache.find(m => m.user.username === username);
                if (member) {
                    closeTicket(member.id);
                }
            }
            
            // 少し待ってからチャンネル削除
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // チャンネル削除
            await channel.delete('チケットが閉じられました');
            
        } catch (error) {
            console.error('❌ チケット閉じるエラー:', error);
            // 既にreplyしている場合はfollowUp、そうでない場合はreply
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: `❌ エラーが発生しました: ${error.message}`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: `❌ エラーが発生しました: ${error.message}`,
                        ephemeral: true
                    });
                }
            } catch (e) {
                console.error('❌ エラー応答失敗:', e);
            }
        }
    }
});

client.login(TOKEN);
