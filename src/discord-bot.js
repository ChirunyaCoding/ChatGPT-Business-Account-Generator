/**
 * Discord Bot - ChatGPTサインアップ自動化 (Firefox/Chrome自動切り替え)
 * Slash Command: /create-account
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');
const { safeDeferReply, safeEditReply, isUnknownInteractionError } = require('./utils/discord-interaction');
const {
    parseCreateAccountResult,
    resolveCreateAccountProgressUpdate,
    resolveCreateAccountChildTimeoutMs,
    summarizeCreateAccountFailure
} = require('./utils/create-account-runtime');
const {
    buildCreateAccountProgressDescriptionChunks,
    buildCreateAccountResultDescriptionChunks
} = require('./utils/create-account-embed-chunks');
const {
    buildCreateAccountLogPrefix,
    createPrefixedLineLogger
} = require('./utils/create-account-log-prefix');
const {
    ensureDiscordRestToken,
    isMissingDiscordRestTokenError
} = require('./utils/discord-rest-token');
const {
    formatDiscordStartupError,
    retryDiscordStartupStep
} = require('./utils/discord-startup');

require('./utils/load-env');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
    console.error('❌ DISCORD_TOKENが設定されていません');
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error('❌ DISCORD_CLIENT_IDが設定されていません');
    process.exit(1);
}

// アカウント保存管理モジュール
const {
    getAllAccounts, removeAccount, loadAccounts, saveCreatedAccounts
} = require('./workspace_manager');

// コマンド定義
const commands = [
    new SlashCommandBuilder()
        .setName('create-account')
        .setDescription('ChatGPTワークスペースを作成します')
        .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('作成するアカウント数（1-30）')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(30)
        )
        .addBooleanOption(option =>
            option
                .setName('keep')
                .setDescription('完了後もChromeを開いたままにする')
                .setRequired(false)
        )
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
        .toJSON(),
    new SlashCommandBuilder()
        .setName('account-list')
        .setDescription('保存済みアカウントの一覧表示と削除')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('保存済みアカウント一覧を表示')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('保存済みアカウントを削除')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('削除するアカウント名')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .toJSON()
];

// コマンド登録
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerSlashCommands() {
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
        return;
    }

    // グローバルコマンドを登録（反映に最大1時間）
    await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
    );
    console.log('✅ グローバルコマンドを登録しました');
    console.log('⏳ 反映に最大1時間かかる場合があります');
}

async function loginDiscordClient() {
    try {
        client.destroy();
    } catch (error) {
        // 既に未接続なら無視
    }

    return client.login(TOKEN);
}

// Botクライアント作成
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const MAX_CONCURRENT_CREATE_ACCOUNT = 1;
const CREATE_ACCOUNT_CHILD_TIMEOUT_MS = resolveCreateAccountChildTimeoutMs();

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

async function deliverCreateAccountResult(interaction, payload) {
    const delivered = await safeEditReply(interaction, payload);
    if (delivered) {
        return true;
    }

    if (!interaction?.channel || typeof interaction.channel.send !== 'function') {
        return false;
    }

    ensureDiscordRestToken(interaction.client, TOKEN);

    try {
        await interaction.channel.send(payload);
        return true;
    } catch (error) {
        if (isMissingDiscordRestTokenError(error)) {
            console.warn('⚠️ Discord RESTトークン未設定のためchannel.sendフォールバックをスキップしました');
            return false;
        }

        console.warn(`⚠️ channel.sendフォールバックに失敗しました: ${error.message}`);
        return false;
    }
}

function buildPagedEmbedTitle(baseTitle, pageIndex, totalPages) {
    if (totalPages <= 1) {
        return baseTitle;
    }

    return `${baseTitle} [${pageIndex + 1}/${totalPages}]`;
}

// コマンド処理
client.on('interactionCreate', async (interaction) => {
    // Autocompleteハンドラ
    if (interaction.isAutocomplete()) {
        try {
            if (interaction.commandName === 'account-list' && interaction.options.getSubcommand() === 'remove') {
                const accounts = getAllAccounts();
                const focused = (interaction.options.getFocused() || '').toLowerCase();
                const choices = accounts
                    .filter((account) => account.name.toLowerCase().includes(focused))
                    .map((account) => ({
                        name: `${account.name} (${account.email})`.slice(0, 100),
                        value: account.name
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

        if (interaction.commandName === 'openbrowser') {
            await handleOpenBrowser(interaction);
            return;
        }

        if (interaction.commandName === 'account-list') {
            await handleAccountListCommand(interaction);
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
    const keepOpen = interaction.options.getBoolean('keep') || false;
    
    // 3秒制限対策: 先にdeferしてから編集応答を返す
    const deferred = await safeDeferReply(interaction, { flags: 0 });
    if (!deferred) {
        return;
    }

    // ブラウザパスを検出
    const browserPaths = detectBrowserPaths();
    const availableBrowsers = [];
    if (browserPaths.chrome) availableBrowsers.push({ type: 'chrome', path: browserPaths.chrome, emoji: '🌐' });
    
    if (availableBrowsers.length === 0) {
        return safeEditReply(interaction, {
            content: '❌ Chrome が見つかりません。Google Chrome をインストールしてください。'
        });
    }

    const initialEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🚀 ChatGPTアカウント作成中')
        .setDescription(`0/${count} 作成待ち...`)
        .setTimestamp();

    const initialReplySent = await safeEditReply(interaction, {
        content: null,
        embeds: [initialEmbed], 
    });
    if (!initialReplySent) {
        return;
    }

    const results = [];
    const savedAccounts = [];
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
                const result = await runSignupScriptWithBrowser(interaction, customUpdateProgress, browserInfo, {
                    keepOpen,
                    accountIndex: index,
                    totalCount: count
                });

                const [savedAccount] = saveCreatedAccounts([{
                    email: result.email,
                    password: result.password,
                    mailDays: result.mailDays,
                    browser: browserInfo.type,
                    source: 'create-account'
                }]);

                if (savedAccount) {
                    savedAccounts.push(savedAccount);
                }
                
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
                const descriptionChunks = buildCreateAccountProgressDescriptionChunks({
                    count,
                    progressStatus,
                    loadingFrame,
                    completed,
                    resultsCount: results.length,
                    errorsCount: errors.length
                });
                const embeds = descriptionChunks.map((description, index) =>
                    new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle(buildPagedEmbedTitle('🚀 ChatGPTアカウント作成中', index, descriptionChunks.length))
                        .setDescription(description)
                        .setTimestamp()
                );

                await safeEditReply(interaction, { content: null, embeds }).catch(() => {});
            } catch (e) {}
        };

        // アニメーション開始
        animationInterval = setInterval(updateProgressDisplay, 1000);

        let nextIndex = 1;
        const workerCount = Math.min(count, MAX_CONCURRENT_CREATE_ACCOUNT);
        const workers = Array.from({ length: workerCount }, async () => {
            while (nextIndex <= count) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                const browserIndex = (currentIndex - 1) % availableBrowsers.length;
                const browserInfo = availableBrowsers[browserIndex];

                await createAccountWithBrowser(currentIndex, browserInfo);
            }
        });

        await Promise.all(workers);

        // アニメーション停止
        if (animationInterval) clearInterval(animationInterval);

        // 結果をインデックス順にソート
        results.sort((a, b) => a.index - b.index);
        errors.sort((a, b) => a.index - b.index);

        // 最終結果表示
        const descriptionChunks = buildCreateAccountResultDescriptionChunks({
            results,
            savedAccounts,
            keepOpen,
            errors
        });
        const embeds = descriptionChunks.length > 0
            ? descriptionChunks.map((description, index) =>
                new EmbedBuilder()
                    .setColor(errors.length === 0 ? 0x00FF00 : 0xFFA500)
                    .setTitle(buildPagedEmbedTitle(`✅ アカウント作成完了 (${results.length}/${count})`, index, descriptionChunks.length))
                    .setDescription(description)
                    .setTimestamp()
            )
            : [
                new EmbedBuilder()
                    .setColor(errors.length === 0 ? 0x00FF00 : 0xFFA500)
                    .setTitle(`✅ アカウント作成完了 (${results.length}/${count})`)
                    .setDescription('表示できる結果はありません。')
                    .setTimestamp()
            ];

        await deliverCreateAccountResult(interaction, {
            content: null,
            embeds
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

            await deliverCreateAccountResult(interaction, {
                content: null,
                embeds: [errorEmbed]
            });
        } catch (e) {
            console.error('Discord応答エラー:', e);
        }
    }
}

// Puppeteerスクリプト実行関数（ブラウザ指定対応）
function runSignupScriptWithBrowser(interaction, updateProgress, browserInfo, options = {}) {
    return new Promise((resolve, reject) => {
        // OSに応じてNodeパスを決定（macOS/Windows両対応）
        const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
        const scriptPath = path.join(__dirname, 'puppeteer_unified.js');
        const args = [scriptPath];

        if (options.keepOpen) {
            args.push('keep');
        }

        const child = spawn(nodePath, args, {
            env: {
                ...process.env,
                PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                HEADLESS: process.env.HEADLESS || 'false',
                CREATE_ACCOUNT_KEEP_OPEN: options.keepOpen ? 'true' : 'false',
                FORCE_BROWSER: browserInfo.type, // ブラウザを強制指定
                BRAVE_PATH: browserInfo.type === 'brave' ? browserInfo.path : '',
                CHROME_PATH: browserInfo.type === 'chrome' ? browserInfo.path : ''
            },
            timeout: CREATE_ACCOUNT_CHILD_TIMEOUT_MS
        });

        let stdout = '';
        let stderr = '';
        const logPrefix = buildCreateAccountLogPrefix({
            accountIndex: options.accountIndex,
            totalCount: options.totalCount,
            browserType: browserInfo.type
        });
        const stdoutLogger = createPrefixedLineLogger({
            prefix: logPrefix,
            writer: (line) => console.log(line)
        });
        const stderrLogger = createPrefixedLineLogger({
            prefix: logPrefix,
            writer: (line) => console.error(line)
        });

        console.log(`${logPrefix} 作成処理を開始します`);

        child.stdout.on('data', async (data) => {
            const output = data.toString();
            stdout += output;
            stdoutLogger.push(output);

            try {
                const progressUpdate = resolveCreateAccountProgressUpdate(stdout);
                if (progressUpdate) {
                    await updateProgress(interaction, progressUpdate.step, progressUpdate.percent);
                }
            } catch (e) {
                // 更新エラーは無視
            }
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            stderrLogger.push(output);
        });

        child.on('close', (code, signal) => {
            stdoutLogger.flush();
            stderrLogger.flush();
            const result = parseCreateAccountResult(stdout);

            if (code === 0 && result.email && result.password) {
                resolve(result);
            } else {
                reject(new Error(summarizeCreateAccountFailure({ code, signal, stdout, stderr })));
            }
        });

        child.on('error', (error) => {
            stdoutLogger.flush();
            stderrLogger.flush();
            reject(error);
        });
    });
}

// Puppeteerスクリプト実行関数（後方互換性のため）
function runSignupScript(interaction, updateProgress) {
    return runSignupScriptWithProgress(interaction, updateProgress);
}

// ブラウザ起動処理
async function handleOpenBrowser(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    const browserChoice = interaction.options.getString('browser');
    const browserName = browserChoice ? browserChoice.toUpperCase() : '自動選択';

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

async function handleAccountListCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();

    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    try {
        if (subcommand === 'list') {
            const accounts = getAllAccounts();

            if (accounts.length === 0) {
                return interaction.editReply({
                    content: '📋 保存済みアカウントはありません'
                });
            }

            const config = loadAccounts();
            const accountList = accounts.map((account, index) => {
                const isDefault = config.default_account === account.name ? ' ⭐' : '';
                const createdAt = account.createdAt
                    ? `<t:${Math.floor(new Date(account.createdAt).getTime() / 1000)}:f>`
                    : '不明';
                const browser = account.browser || 'unknown';
                return [
                    `**${index + 1}. ${account.name}**${isDefault}`,
                    `📧 \`${account.email}\``,
                    `🔑 \`${account.password}\``,
                    `🌐 ${browser}`,
                    `🕒 ${createdAt}`
                ].join('\n');
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`📋 保存済みアカウント一覧 (${accounts.length}件)`)
                .setDescription(accountList.slice(0, 4000))
                .setTimestamp();

            await safeEditReply(interaction, { embeds: [embed] });
            return;
        }

        if (subcommand === 'remove') {
            const name = interaction.options.getString('name');
            const removedAccount = removeAccount(name);

            if (!removedAccount) {
                return safeEditReply(interaction, {
                    content: `❌ アカウント「${name}」が見つかりません`
                });
            }

            await safeEditReply(interaction, {
                content: `✅ アカウント「${removedAccount.name}」を削除しました\n📧 \`${removedAccount.email}\``
            });
        }
    } catch (error) {
        console.error('❌ account-list コマンドエラー:', error);
        await safeEditReply(interaction, {
            content: `❌ エラーが発生しました: ${error.message}`
        });
    }
}

async function startDiscordBot() {
    try {
        await retryDiscordStartupStep(
            'スラッシュコマンド登録',
            () => registerSlashCommands(),
            { log: console.warn }
        );
        await retryDiscordStartupStep(
            'Discord Botログイン',
            () => loginDiscordClient(),
            { log: console.warn }
        );
    } catch (error) {
        console.error(`❌ Discord起動エラー: ${formatDiscordStartupError(error)}`);
        process.exit(1);
    }
}

startDiscordBot();
